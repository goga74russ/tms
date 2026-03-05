const { Client } = require('ssh2');

const sshConfig = {
    host: '5.42.102.58',
    port: 22,
    username: 'root',
    password: 'n2ggTgRB2#P1Z6',
    readyTimeout: 20000,
};

const cmd = `
# Убираем старую переменную, если она есть
sed -i '/^NEXT_PUBLIC_API_URL=/d' /opt/tms/.env
# Добавляем правильный публичный IP для браузера
echo 'NEXT_PUBLIC_API_URL=http://5.42.102.58:4000/api' >> /opt/tms/.env

# Пересобираем фронтенд с новым енвом
cd /opt/tms && docker compose -f docker-compose.prod.yml up -d --build web
`;

console.log("Fixing .env on VPS and rebuilding Web container...");
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
