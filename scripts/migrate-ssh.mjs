import { Client } from 'ssh2';
import * as fs from 'fs';

const sshConfig = {
    host: '5.42.102.58',
    port: 22,
    username: 'root',
    password: 'n2ggTgRB2#P1Z6',
    readyTimeout: 20000,
};

// Start a temporary docker container connected to the tms_default network.
// It will mount the /opt/tms folder (which contains the source code extracted during deploy),
// load the dynamically generated .env, and run the db:migrate and db:seed scripts.

const cmd = `
cd /opt/tms && \
docker run --rm --network tms_default -v /opt/tms:/app -w /app node:20-alpine sh -c "\
  corepack enable && \
  export \$(cat .env | grep -v '#' | xargs) && \
  pnpm install && \
  pnpm --filter @tms/api run db:migrate && \
  pnpm --filter @tms/api run db:seed \
" && docker compose -f docker-compose.prod.yml restart api
`;

console.log("Connecting to VPS to run DB migrations...");
const conn = new Client();

conn.on('ready', () => {
    console.log("Connected. Executing migration...");
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
