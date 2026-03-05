const fs = require('fs');
const { Client } = require('ssh2');

const sshConfig = {
    host: '5.42.102.58',
    port: 22,
    username: 'root',
    password: 'n2ggTgRB2#P1Z6',
    readyTimeout: 20000,
};

const localDockerfile = fs.readFileSync('d:\\Ai\\TMS\\apps\\web\\Dockerfile');
const localCompose = fs.readFileSync('d:\\Ai\\TMS\\docker-compose.prod.yml');

const b64Dockerfile = localDockerfile.toString('base64');
const b64Compose = localCompose.toString('base64');

const cmd = `
echo "${b64Dockerfile}" | base64 -d > /opt/tms/apps/web/Dockerfile
echo "${b64Compose}" | base64 -d > /opt/tms/docker-compose.prod.yml

echo "Rebuilding Web server with Base64 payload..."
cd /opt/tms && docker compose -f docker-compose.prod.yml up -d --build web
`;

const conn = new Client();

conn.on('ready', () => {
    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        stream.on('close', (code, signal) => {
            console.log('Build finished with code ' + code);
            conn.end();
        }).on('data', (data) => {
            process.stdout.write(data);
        }).stderr.on('data', (data) => {
            process.stderr.write(data);
        });
    });
}).on('error', (err) => {
    console.error('SSH Error:', err);
}).connect(sshConfig);
