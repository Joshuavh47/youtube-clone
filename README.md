# Youtube Clone

This is a video streaming platform (similar to YouTube) with a multitude of features. Security and scalability are at the forefront of this project, with many core decisions being based off of throughput, ease of scalability in production, and secure coding practices/business logic.

## How I Did It

Tech used (so far): Typescript, Express, MongoDB/Mongoose, Kafka, Nginx, AWS S3/Minio, Python, FFMPEG, Multiprocessing, Webhooks, Lua

This project contanins an Express web server that manages many of the CRUD operations pertaining to Users, Videos, Comments, and Sessions. Upon researching for this project, I found that having to load full length, unprocessed videos takes a lot of time and memory (who would have thought.) To overcome this, I created a video processing microservice in Python that leverages FFMPEG to convert videos to HLS in H.264/AAC format. I chose HLS over other Adaptive Bitrate Streaming protocols such as MPEG-DASH because it is pretty widely supported and because, being a proprietary Apple protocol, it is the only ABS protocol that Apple devices natively support. However, since MPEG-DASH is codec agnostic, I could add support for this in the future.

When a user uploads a video, its path is as follows:

1. The client sends a post request to the `/upload` path.
2. The backend creates a MongoDB object for the video and generates a signed URL that the user can upload the video to directly.
3. Once the video has finished uploading, the S3 bucket (in my case MinIO) sends a hook to Kafka containing the event's information
4. Multiple worker processes in the video processing microservice poll Kafka and when a new message is detected, FFMPEG transcodes the video, we generate a HLS playlist file, and these are all uploaded to our `processed` S3 bucket. The `multiprocessing` Python module is used for the worker processes so we can handle multiple videos in parallel.
5. Upon an error free processing round, the status of the video is updated in MongoDB.

## Scalability

One of the key decision-making factors in this project was scalability in a production environment. With this being a portfolio project, I wanted to push myself to make this project as scalable as possible in a production environment. To accomplish this, I made the following design decisions:

- Using Kafka producers and consumers as a video processing queue
  - Originally, I opted to use a unix socket for this task. Upon further reflection, I realized this would not be optimal because it would make it hard to scale across multiple systems. With Kafka being language agnostic, high throughput, and easily deployable in a cluster, I thought this would be the best solution for a production environment with thousands of request per minute. I opted for the `confluent-kafka` module for my Kafka consumer becuase it uses the `librdkafka` C library under the hood, which is built for high performance and throughput.
- Signed URLs for video uploads
  - I used signed URLs for video uploads because it takes load off of the backend and lets it process other requests. This increases scalability because it separates video uploads from the rest of the server, allowing the server to perform its normal operations without managing file uploads and then uploading to MinIO. This is also great because even though TypeScript offers support for asynchronous operations, the single threaded nature of the language in conjunction with the blocking of the single thread during IO operations would not be optimal for scaling to thousands of uploads per minute in a production setting.

## Security

In addition to scalability, security posture also heavily influenced my decision making in this project. Having specialized in cybersecurity with my Computer Science degree, I am passionate about mitigating security weaknesses in the tooling and business logic implemented throughout this project. To accomplish this goal, I made a few key decisions:

- Signed URLs
  - Signed URLs have benefits pertaining to scalability, but this decision also has important security implications. One security win that results of this is the fact that when generating a signed URL, the backend is able to specify its filename. This means that there is no posibility of arbitrary command injection through the video filenames, as the backend controls what each of these names will be in the S3 bucket. This is critical when processing videos using FFMPEG, since the Python bindings are ran via the `subprocess` module (however this can be further mitigated by containerizing the video processing microservice, which might happen in a later commit.) Signed URLs can also expire, making them really nice for secure file uploads. One con about using signed URLs is that file validation must take place after the file is uploaded. This isn't a huge deal, however, since the files are never executed directly upon upload and because you are also able to specify an accepted content type for uploads when generating a signed URL.
- mTLS
  - When I first started this project, I used an OpenResty proxy to add an HMAC header to all outgoing MinIO webhooks, which were then sent to my backend for validation and sent to the Kafka broker. However, I realized that this would create additional overhead when simply using mTLS would suffice for both authentication and encryption purposes. This holds true because mTLS provides message encryption, preserves message integrity, and mutual authentication- which would essentially be the same as using HMAC with a proxy (like my backend) and regular SSL/TLS.
- Session Management
  - I used the built-in Express Session Management middleware because I like the way sessions work in comparison to JWT in the context of this project. Session invalidation can be challenging when it comes to the stateless nature of JWTs, and having the ability to validate and invalidate sessions super easily beats the cons of managing my own session store.

## How to Run This Yourself

1. Clone this repository
2. Navigate to the `server` folder
3. Install the dependencies with `npm install`
4. [Install Kafka](https://kafka.apache.org/documentation/)
5. [Install MinIO](https://min.io/docs/minio/linux/index.html)
6. Start Zookeeper/Kafka
7. Start the MinIO server in the folder of your choosing
8. If you are planning on using mTLS/SSL, now is a good time to follow the steps outlined in the [Secure Setup section](#secure-setup)
9. Follow the directions in the [MinIO documentation for creating Kafka webhooks](https://min.io/docs/minio/linux/administration/monitoring/publish-events-to-kafka.html). Note: If you are running this in production (using mTLS,) make sure you include these certificates when creating the hook.
10. In the `./server` folder, populate a `.env` file with the following:

    ```bash
    MONGO=<Mongo URI>
    SESSION_SECRET=<A secret for the session store>
    MINIO_ACCESS_KEY=<S3 bucket access key>
    MINIO_SECRET=<Your S3 secret>
    VIDEO_PROCESS_DIR=<The temp directory you want to use to store video files while processing>
    HMAC_SECRET=<An HMAC secret of your choosing>
    KAFKA_URI=<The URI for your Kafka server (default is localhost)>
    KAFKA_PORT=<The port for your Kafka server (default is 9092)>
    ```

11. Follow the directions on the [MinIO Documentation](https://min.io/docs/minio/linux/index.html) to create a Kafka hook to your Kafka broker
12. Either build the Typescript using `npm run build` or just use tsc-watch with `npm run dev`
13. Run the video processing service by navigating to the `videoPrep` folder inside of the `server` folder and running `python3 videoprocd.py`

### Secure Setup

Follow these instructions to set up mTLS for your Kafka and Minio relationship. Instructions for generating self-signed certificates can be found [here](https://www.baeldung.com/openssl-self-signed-cert). These are not exact instructions, but do show how to create certs using OpenSSL. Ideally, in production, all of the certs should be from a trusted CA (not self-signed,) but for testing purposes, this is fine. Any code block containing angle brackets can be customized (Ex: `O=<MyOrg>` could be `O=Example\ Inc.`)

1. Make a folder to hold all the certs. This can be anywhere that is readable by the cloned repository.
2. Inside of this, make a folder to store the CA files
3. Make the CA's private key. Ex: `openssl genrsa -out ca/ca.key 4096`
4. Create a self-signed root certificate. Ex: `openssl req -x509 -new -nodes -key ca/ca.key -sha256 -days <days> -out ca/ca.crt -subj "/C=<US>/ST=<State>/L=<City>/O=<MyOrg>/OU=<CA>/CN=<MyRootCA>"` (with the options in angle brackets corresponding to your needs)
5. Create a folder for your Kafka certs in a directory adjacent to your CA folder
6. Create a private key for the Kafka service. Ex: `openssl genrsa -out kafka/kafka.key 2048`
7. Create a CSR with the Kafka private key. Ex: `openssl req -new -key kafka/kafka.key -out kafka/kafka.csr -subj "/C=<US>/ST=<State>/O=<Kafka>/OU=<Broker>/CN=Common Name Here>"` (customize angle brackets to your needs)
8. Create a config file for SAN. Example: make a file named `openssl.cnf` and populate it with
  
    ```bash
    [req]
    distinguished_name=req
    [req_distinguished_name]
    [v3_req]
    subjectAltName=DNS:<Insert DNS Name Here>
    ```

9. Sign the cert with our CA. Ex: `openssl x509 -req -in kafka/kafka.csr -CA ca/ca.crt -CAkey ca/ca.key -CAcreateserial \
  -out kafka/kafka.crt -days <days> -sha256 -extfile kafka/openssl.cnf -extensions v3_req`
10. Repeat steps 5-9 to create the certificate for our MinIO bucket (for the MinIO/Kafka relationship)
11. In your .env file, include:

    ```bash
    KAFKA_SSL_CA_LOCATION=<Location to CA cert>
    KAFKA_SSL_CERT_LOCATION=<Location to Kafka cert>
    KAFKA_SSL_KEY_LOCATION=<Location to Kafka key file>
    ```

    These are necesary for the video processing service to use SSL with Kafka.

12. Get certificates for MinIO (regular SSL for video streaming and signed URL purposes) and the rest of the website ***from a trusted Certiicate Authority***. If the cerrtificate is not from a trusted CA, the certificate will be marked as insecure in all modern browsers.

Final directory structure (besides certs in step 11):

```bash
certs/
├── ca/
│   ├── ca.crt
│   └── ca.key
├── kafka/
│   ├── kafka.crt
│   ├── kafka.key
├── minio/
│   ├── client.crt
│   ├── client.key
```

## Final Thoughts

Overall, this project was a great way for me to practice building a scalable and secure video streaming solution. I learned so many new things- from video codecs/streaming protocols to Kafka topics to managing session stores in MongoDB. One of the greatest challenges in this project, like all projects, is going down research rabbitholes. A lot of big projects start with a "simple" idea that you don't know a lot about that ends up not being so simple once you start looking into accomplishing the things you're trying to do. However, I've come to learn that these are the projects in which you normally learn the most, and I have come to like them because of this. This project made me think not just like a software developer, but as a *software engineer*. Having to think about the scalability, security implications, and networking challenges that arose throughout the duration of this project made me a much better software engineer, and the wholistic approach to software design that I experienced throughout this project will cause me to think of these things in every project I am involved in going forward.

While there are a lot of cool things in this project currently, I am still trying to add:

- Logging
- Containerizing the video processing microservice
- Automating initialization of the project and services it depends on
- Retry functionality and logic for removing old videos from the video processing queue
- Better error handling throughout the project, with a focus on cleaning up the error logic in the video processing microservice
- Frontend code

Thank you for reading, I hope you like this project!
