import { Client } from 'ssh2';

const sshConfig = {
    host: '5.42.102.58',
    port: 22,
    username: 'root',
    password: 'n2ggTgRB2#P1Z6',
    readyTimeout: 20000,
};

// Run the seed script inside the running API container
const cmd = 'cd /opt/tms && docker compose -f docker-compose.prod.yml exec api npx tsx apps/api/src/db/seed.ts';

console.log("Seeding database on VPS...");
const conn = new Client();

conn.on('ready', () => {
    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        stream.on('close', (code, signal) => {
            console.log('Seed finished with code ' + code);
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
