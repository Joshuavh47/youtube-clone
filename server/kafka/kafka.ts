import { Kafka, logLevel, Producer } from 'kafkajs';
import dotenv from "dotenv";

export interface KafkaMessage {
    videoId: string, 
    contentType: string
}


const kafka = new Kafka({
  clientId: 'video-uploader',
  brokers: [`${process.env.KAFKA_URI ?? 'localhost'}:${process.env.KAFKA_PORT ?? 9092}`],
  logLevel: logLevel.ERROR,
});

const producer: Producer = kafka.producer();

export const connectKafkaProducer = async () => {
    await producer.connect();
    console.log('Kafka connected successfully');
}

export const sendJobToQueue = async (topic: string, message: KafkaMessage) => {
    await producer.send({
        topic,
        messages: [
            {
                key: message.videoId ?? null, 
                value: JSON.stringify(message),
            },
        ],
    });
    // TODO: Add logging
}

export const createTopic = async () => {
    const admin = kafka.admin();
    await admin.connect();
    return await admin.createTopics({
    topics:[
        {
            topic: 'video-processing-queue',
            numPartitions: 3,
            replicationFactor: 1,
        },
    ],
    waitForLeaders: true,
    });
    
    

}