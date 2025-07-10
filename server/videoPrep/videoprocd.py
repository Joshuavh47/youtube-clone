import multiprocessing
import os
from minio import Minio
from dotenv import load_dotenv
import ffmpeg
import traceback
import shutil
import json
from confluent_kafka import Consumer
from pymongo import MongoClient
from processing_utils import ProcessingError, uploadStatus
from confluent_kafka.admin import AdminClient, NewTopic

# log_path = ""

load_dotenv()

num_workers = 5

process_pool = []

kafka_options = {
    'bootstrap.servers': f'{os.environ.get('KAFKA_URI') or 'localhost'}:{os.environ.get('KAFKA_PORT') or ('9093' if os.environ.get('SECURE')=='true' else '9092')}',
    'group.id': 'video-processors',
    'auto.offset.reset': 'earliest',
}

minio_options = {
    'endpoint': f"{os.environ.get('MINIO_URI') or 'localhost'}:{os.environ.get('MINIO_PORT') or '9000'}",
    'access_key': os.environ.get('MINIO_ACCESS_KEY'),
    'secret_key': os.environ.get('MINIO_SECRET'), 
    'secure': True if os.environ.get('SECURE') == 'true' else False
}

mongo_client = MongoClient(os.environ.get('MONGO'))
mongo_db = mongo_client['test']
mongo_collection = mongo_db['videos']

def init_kafka_options():
    if os.environ.get('SECURE') == 'true':
        kafka_options.update(
            {
                "ssl.ca.location": os.environ.get('KAFKA_SSL_CA_LOCATION'),
                "ssl.certificate.location": os.environ.get('KAFKA_SSL_CERT_LOCATION'),
                "ssl.key.location": os.environ.get('KAFKA_SSL_KEY_LOCATION'),
            }
        )


def initProcesses(num_workers):
    for _ in range(num_workers):
        process_pool.append(multiprocessing.Process(target=processVideo))
   

def convertToH264(input_file, output_dir, id, attempts):
    resolutions = {
        '360p': {'scale': '640x360', 'bitrate': '800k'},
        '720p': {'scale': '1280x720', 'bitrate': '2000k'},
        '1080p': {'scale': '1920x1080', 'bitrate': '4000k'}
    }
    output_with_id = os.path.join(output_dir, id)
    # Make a temp directory for our new files
    if not os.path.exists(output_with_id):
        os.makedirs(output_with_id)

    try:
        for res, params in resolutions.items():
            
            playlist_name = f'{output_dir}/{id}/{res}.h3u8'
            # Convert to HLS (H.264/AAC)
            ffmpeg.input(input_file).output(
                playlist_name,
                format='hls',
                hls_time=10,
                hls_playlist_type='vod',
                hls_flags='independent_segments',
                hls_segment_filename=f'{output_dir}/{id}/{res}_%03d.ts',
                start_number=0,
                hls_list_size=0,
                video_bitrate=params["bitrate"],
                vf=f'scale={params["scale"]}',
                vcodec='libx264',
                acodec='aac',
                strict='-2'
            ).run()
    except ffmpeg.Error as e:
        print(e.stderr)
        if(attempts <= 0):
            for filename in os.listdir(output_with_id):
                file_path = os.path.join(output_with_id, filename)
                if os.path.isfile(file_path):
                    try:
                        os.remove(file_path)
                    except OSError as e:
                        print(f"Error deleting {file_path}: {e}")
            raise ProcessingError()
        convertToH264(input_file, output_dir, id, attempts-1)
    
    try:
        # Create master playlist (HLS)
        with open(f'{output_dir}/{id}/master.m3u8', 'w') as f:
            f.write('#EXTM3U\n')
            for res, _ in resolutions.items():
                # URI is id/res.h3u8 because that is the format that is used in the S3 bucket
                f.write(f'#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="video",NAME="{res}",DEFAULT=NO,AUTOSELECT=YES,URI="{id}/{res}.m3u8"\n')
            for res, params in resolutions.items():
                f.write(f'#EXT-X-STREAM-INF:BANDWIDTH={params["bitrate"][:-1]}000,AVERAGE-BANDWIDTH={params["bitrate"][:-1]}000,CODECS="avc1.42c01e,mp4a.40.2",RESOLUTION={params["scale"]},GROUP-ID="video"\n') # pyright: ignore
                f.write(f'{id}/{res}.h3u8\n')
    except Exception as e: 
        print(f"Error reading/writing to master playlist: {e}")
        traceback.print_exc()


def processVideo():
    # Start Minio Client
    
    minioClient=Minio(
        **minio_options
    )
    
    # Start Kafka consumer
    kafkaConsumer = Consumer(kafka_options)
    # Subscribe to our video processing topic
    kafkaConsumer.subscribe(['video-processing-queue'])
    # Get the temp dir for video processing
    video_process_dir = os.environ.get('VIDEO_PROCESS_DIR')

    # End of init, start processing
    while(True):
        # Check for new messages
        msg = kafkaConsumer.poll(1.0)
        if msg is None: 
            continue
        if msg.error():
            raise LookupError("Kafka Message Error")
        # Get the video ID
        parsed_msg = json.loads(msg.value().decode("utf-8"))
        for r in parsed_msg['Records'][0]:
            print(r)

        videoId = parsed_msg['Records'][0]['s3']['object']['key']

        # Establish input/output directories for processed videos
        input_path = f"{video_process_dir}/unprocessed/{videoId}"
        output_dir = f"{video_process_dir}/processed"
        
        # Get the corresponding object from S3
        try:
            minioClient.fget_object("unprocessed", videoId, input_path)
        except:
            print("no work")
        # Convert video
        try:
            convertToH264(input_path, output_dir, videoId, 2)
        except ProcessingError as e:
            print(f"Error Processing Video: {e}")
            mongo_collection.find_one_and_update({'_id': videoId}, {
                '$set': {
                    'uploadStatus': uploadStatus.FAILED
                    }
                }
            )
            continue

        mongo_collection.find_one_and_update({'_id': videoId}, {
            '$set': {
                'uploadStatus': uploadStatus.SUCCESSFUL
                }
            }
        )

        minioClient.remove_object('unprocessed', videoId)

        # List of files created from convertToH264
        created_files = os.listdir(f'{output_dir}/{videoId}')
        try:
            # Put processed files into the processed S3 bucket
            for path in created_files:
                name = os.path.basename(path)
                minioClient.fput_object("processed", f"{videoId}/{name}", f'{output_dir}/{videoId}/{path}')
                print(path) # Sanity check
        except Exception as e:
            print(f'Error uploading files to S3 bucket: {e}')
            traceback.print_exc()

        try:
            # Remove files after upload
            shutil.rmtree(f'{output_dir}/{videoId}')
            os.remove(f'{video_process_dir}/unprocessed/{videoId}')
        except Exception as e:
            print(f'Unable to delete directory {output_dir}/{videoId}: {e}')
            traceback.print_exc()




if __name__ == "__main__":
    load_dotenv()

    init_kafka_options()

    kafka_admin = AdminClient(kafka_options)
    kafka_topics = list(kafka_admin.list_topics(timeout=10).topics.keys())
    if 'video-processing-queue' not in kafka_topics:
        topic = [NewTopic('video-processing-queue', num_partitions=10, replication_factor=1)]
        created_topic = kafka_admin.create_topics(topic)


    minioClient=Minio(**minio_options)

    found_unprocessed = minioClient.bucket_exists('unprocessed')
    found_processed = minioClient.bucket_exists('processed')
    if not found_unprocessed or not found_processed:
        print("Unable to find buckets!")
        exit()
    
    initProcesses(num_workers)
    for i in range(len(process_pool)):
        process_pool[i].start()
    for i in range(len(process_pool)):
        process_pool[i].join()
    
    # TODO: implement logging for all processes
