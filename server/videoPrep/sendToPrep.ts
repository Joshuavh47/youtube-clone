import net from 'net'

export const sendToProcessor = (id: string)=> {
    const socketPath = "/tmp/videoprocd.sock";
    const client = net.connect(socketPath, () => {
        client.write(`${id}`);
      });
    
      client.on('error', (err) => {
        console.error('Error connecting to socket server:', err);
      });
}
