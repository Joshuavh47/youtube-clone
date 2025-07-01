import crypto from 'crypto';

export const verify_signature = (body: string, received_signature: string): boolean => {
    if(!process.env.HMAC_SECRET){
        throw new Error("HMAC secret not in env!");
    }
    const hmac = crypto.createHmac('sha256', process.env.HMAC_SECRET!);
    hmac.update(body);
    const expected_signature = hmac.digest('base64');

    const received_buff = Buffer.from(received_signature);
    const expected_buff = Buffer.from(expected_signature);

    if(received_buff.length != expected_buff.length){
        throw new Error("Received and expected HMAC hash length not equal!");
    }

    const valid = crypto.timingSafeEqual(received_buff, expected_buff);
    return valid;
}