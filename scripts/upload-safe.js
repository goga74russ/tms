const fs = require('fs');
const { Client } = require('ssh2');

const sshConfig = {
    host: '5.42.102.58',
    port: 22,
    username: 'root',
    password: 'n2ggTgRB2#P1Z6',
    readyTimeout: 20000,
};

const localLoginContent = fs.readFileSync('d:\\Ai\\TMS\\apps\\web\\src\\app\\login\\page.tsx', 'utf8');

const cmd = `mkdir -p /opt/tms/apps/web/src/app/login
cat << 'EOF_REACT' > /opt/tms/apps/web/src/app/login/page.tsx
${localLoginContent.replace(/\$/g, '\\$')}
EOF_REACT
cd /opt/tms && docker compose -f docker-compose.prod.yml up -d --build web
`;

console.log("Rebuilding Web server side via single flat command...");
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
