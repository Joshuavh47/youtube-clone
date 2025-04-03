import multiprocessing
import socket
import os
from minio import Minio
from dotenv import load_dotenv
import ffmpeg
import traceback
import shutil

# log_path = ""

num_workers = 2
socket_path = "/tmp/videoprocd.sock"
video_process_dir_global = ""

process_pool = []


def initProcesses(queue, num_workers):
    for _ in range(num_workers):
        process_pool.append(multiprocessing.Process(target=processVideo, args=(queue,)))
   
    process_pool.append(multiprocessing.Process(target=listenForIds, args=(queue,)))

def convertToH264(input_file, output_dir, id):
    resolutions = {
        '360p': {'scale': '640x360', 'bitrate': '800k'},
        '720p': {'scale': '1280x720', 'bitrate': '2000k'},
        '1080p': {'scale': '1920x1080', 'bitrate': '4000k'}
    }
    

    if not os.path.exists(f'{output_dir}/{id}'):
        os.makedirs(f'{output_dir}/{id}')

    try:
        for res, params in resolutions.items():
            
            playlist_name = f'{output_dir}/{id}/{res}.h3u8'
            
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
    
    try:
        with open(f'{output_dir}/{id}/{id}_master.m3u8', 'w') as f:
            f.write('#EXTM3U\n')
            for res, _ in resolutions.items():
                f.write(f'#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="video",NAME="{res}",DEFAULT=NO,AUTOSELECT=YES,URI="{id}/{res}.m3u8"\n')
            for res, params in resolutions.items():
                f.write(f'#EXT-X-STREAM-INF:BANDWIDTH={params["bitrate"][:-1]}000,AVERAGE-BANDWIDTH={params["bitrate"][:-1]}000,CODECS="avc1.42c01e,mp4a.40.2",RESOLUTION={params["scale"]},GROUP-ID="video"\n') # pyright: ignore
                f.write(f'{id}/{res}.h3u8\n')
    except Exception as e: 
        print(f"Error reading/writing to master playlist: {e}")
        traceback.print_exc()

def processVideo(queue):
    minioClient=Minio(
        endpoint="localhost:9000",
        access_key=os.environ.get('MINIO_ACCESS_KEY'),
        secret_key=os.environ.get('MINIO_SECRET'), 
        secure=False
    )
    video_process_dir = os.environ.get('VIDEO_PROCESS_DIR')
    while(True):
        filename = queue.get()
        if not filename:
            continue
        print(filename)
        id = os.path.splitext(filename)[0]
        inputDir = f"{video_process_dir}/unprocessed/{filename}"
        output_dir = f"{video_process_dir}/processed"
        
        minioClient.fget_object("unprocessed", filename, inputDir)

        convertToH264(inputDir, output_dir,id)

        created_files = os.listdir(f'{output_dir}/{id}')
        try:
            for path in created_files:
                name = os.path.basename(path)
                minioClient.fput_object("processed", f"{id}/{name}", f'{output_dir}/{id}/{path}')
                print(path)
        except Exception as e:
            print(f'Error uploading files to S3 bucket: {e}')
            traceback.print_exc()

        try:
            shutil.rmtree(f'{output_dir}/{id}')
            os.remove(f'{video_process_dir}/unprocessed/{filename}')
        except Exception as e:
            print(f'Unable to delete directory {output_dir}/{id}: {e}')
            traceback.print_exc()


def listenForIds(queue):
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.bind(socket_path)
    sock.listen(5)
    while(True):
        conn, addr = sock.accept()
        data = conn.recv(100)
        filename = data.decode().strip()
        if(filename != None):
            queue.put(filename)
        

if __name__ == "__main__":
    load_dotenv()
    if(os.path.exists(socket_path)):
        try:
            os.remove(socket_path)
        except Exception as e:
            print(e)
            traceback.print_exc()
            exit()

    minioClient=Minio(
        endpoint="localhost:9000",
        access_key=os.environ.get('MINIO_ACCESS_KEY'),
        secret_key=os.environ.get('MINIO_SECRET'), 
        secure=False
    )

    found_unprocessed = minioClient.bucket_exists('unprocessed')
    found_processed = minioClient.bucket_exists('processed')
    if not found_unprocessed or not found_processed:
        print("Unable to find buckets!")
        exit()
    
    """
    Queue must be explicitly declared as variables due to bug #94765 in python/cpython
    GitHub repo. This bug affects some macOS and linux hosts, making it imposible to use 'spawn' 
    as the start method for new processes unless the multiprocessing objects are declared in 
    variables in the __name__ == "__main__" section, or else a FileNotFound error will be thrown. 
    This method is prefered because spawn is safer and more lightweight than fork. 
    """
    
    queue = multiprocessing.Queue()
    initProcesses(queue, num_workers)
    for i in range(len(process_pool)):
        process_pool[i].start()
    for i in range(len(process_pool)):
        process_pool[i].join()
    
    # TODO: implement logging for all processes
