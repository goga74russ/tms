const { Client } = require('ssh2');

const sshConfig = {
    host: '5.42.102.58',
    port: 22,
    username: 'root',
    password: 'n2ggTgRB2#P1Z6',
    readyTimeout: 20000,
};

const cmd = `docker compose -f /opt/tms/docker-compose.prod.yml exec -T postgres psql -U tms -d tms -c "ALTER TABLE users ADD COLUMN IF NOT EXISTS contractor_id UUID, ADD COLUMN IF NOT EXISTS organization_id UUID;"`;

console.log("Adding missing columns to users table via SSH...");
const conn = new Client();

conn.on('ready', () => {
    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        stream.on('close', (code, signal) => {
            console.log('Migration finished with code ' + code);
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
