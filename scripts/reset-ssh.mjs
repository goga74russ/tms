import { Client } from 'ssh2';

const VPS = {
    host: '5.42.102.58',
    port: 22,
    username: 'root',
    password: 'n2ggTgRB2#P1Z6',
};

function sshExec(conn, cmd) {
    return new Promise((resolve, reject) => {
        conn.exec(cmd, (err, channel) => {
            if (err) return reject(err);
            let stdout = '';
            let stderr = '';
            channel.on('data', data => {
                const str = data.toString();
                stdout += str;
                process.stdout.write(str);
            });
            channel.stderr.on('data', data => {
                const str = data.toString();
                stderr += str;
                process.stderr.write(str);
            });
            channel.on('close', code => {
                resolve({ stdout, stderr, code });
            });
        });
    });
}

async function main() {
    console.log('🔄 Resetting passwords via SSH...');
    const conn = new Client();

    conn.on('error', err => {
        console.error('❌ SSH Error:', err.message);
        process.exit(1);
    });

    conn.on('ready', async () => {
        console.log('✅ Connected to VPS');

        // Inside the VPS, the code lives at /opt/tms
        // The reset-passwords.ts script was added to apps/api/reset-passwords.ts
        // Since we deploy the entire local directory, it should be there.
        // We can run it via Docker:

        const cmd = `cd /opt/tms && docker compose -f docker-compose.prod.yml exec -T postgres psql -U tms -d tms -c "UPDATE users SET password_hash = '\\$2a\\$12\\$iUx8xtqMcWwQLz1WQ1IP5OHpSI0sVO.ZqboyakN9.qbWM61ju6h.S';"`;
        console.log(`🚀 Executing: ${cmd}`);

        const result = await sshExec(conn, cmd);
        if (result.code === 0) {
            console.log('✅ Passwords reset successfully!');
        } else {
            console.error('⚠️ Reset command exited with code:', result.code);
        }
        conn.end();
    });

    conn.connect(VPS);
}

main().catch(console.error);
