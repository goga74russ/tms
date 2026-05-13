// Tiny HTTP proxy that forwards :3030 → :80 (our nginx in docker)
// Used so Claude Preview can drive the dockerised stack without taking port 80.
import http from 'node:http';

const PROXY_PORT = Number(process.env.PORT) || 3030;
const TARGET_HOST = 'localhost';
const TARGET_PORT = 80;

const server = http.createServer((clientReq, clientRes) => {
    const options = {
        host: TARGET_HOST,
        port: TARGET_PORT,
        method: clientReq.method,
        path: clientReq.url,
        headers: { ...clientReq.headers, host: `${TARGET_HOST}:${TARGET_PORT}` },
    };

    const proxyReq = http.request(options, (proxyRes) => {
        clientRes.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
        proxyRes.pipe(clientRes, { end: true });
    });

    proxyReq.on('error', (err) => {
        console.error('proxy error:', err.message);
        clientRes.writeHead(502);
        clientRes.end('Bad Gateway');
    });

    clientReq.pipe(proxyReq, { end: true });
});

server.on('upgrade', (clientReq, clientSock, head) => {
    const targetSock = http.request({
        host: TARGET_HOST,
        port: TARGET_PORT,
        method: clientReq.method,
        path: clientReq.url,
        headers: { ...clientReq.headers, host: `${TARGET_HOST}:${TARGET_PORT}` },
    });
    targetSock.on('upgrade', (targetRes, targetSocket) => {
        clientSock.write(
            `HTTP/1.1 101 ${targetRes.statusMessage}\r\n` +
            Object.entries(targetRes.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') +
            `\r\n\r\n`
        );
        targetSocket.pipe(clientSock);
        clientSock.pipe(targetSocket);
    });
    targetSock.end();
});

server.listen(PROXY_PORT, () => {
    console.log(`Preview proxy: http://localhost:${PROXY_PORT} → http://${TARGET_HOST}:${TARGET_PORT}`);
});
