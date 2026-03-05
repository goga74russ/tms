// ============================================================
// TMS — SSH Deploy Script (runs from Windows)
// Usage: node scripts/deploy-ssh.mjs
// ============================================================
import { Client } from 'ssh2';
import { readFileSync, createReadStream, statSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const VPS = {
    host: '5.42.102.58',
    port: 22,
    username: 'root',
    password: 'n2ggTgRB2#P1Z6',
};

const PROJECT_DIR = '/opt/tms';
const LOCAL_TAR = join(process.env.USERPROFILE || '', 'tms.tar.gz');

// --- Helper: run SSH command ---
function sshExec(conn, cmd, { stream = false } = {}) {
    return new Promise((resolve, reject) => {
        conn.exec(cmd, (err, channel) => {
            if (err) return reject(err);
            let stdout = '';
            let stderr = '';
            channel.on('data', (data) => {
                const str = data.toString();
                stdout += str;
                if (stream) process.stdout.write(str);
            });
            channel.stderr.on('data', (data) => {
                const str = data.toString();
                stderr += str;
                if (stream) process.stderr.write(str);
            });
            channel.on('close', (code) => {
                resolve({ stdout, stderr, code });
            });
        });
    });
}

// --- Helper: upload file via SFTP ---
function sftpUpload(conn, localPath, remotePath) {
    return new Promise((resolve, reject) => {
        conn.sftp((err, sftp) => {
            if (err) return reject(err);
            const readStream = createReadStream(localPath);
            const writeStream = sftp.createWriteStream(remotePath);

            let transferred = 0;
            const total = statSync(localPath).size;
            const totalMB = (total / 1024 / 1024).toFixed(1);

            readStream.on('data', (chunk) => {
                transferred += chunk.length;
                const pct = ((transferred / total) * 100).toFixed(0);
                process.stdout.write(`\r  📤 Uploading: ${pct}% (${(transferred / 1024 / 1024).toFixed(1)}/${totalMB} MB)`);
            });

            writeStream.on('close', () => {
                console.log('\n  ✅ Upload complete');
                resolve();
            });

            writeStream.on('error', reject);
            readStream.pipe(writeStream);
        });
    });
}

async function main() {
    console.log('🚛 TMS Deploy to VPS');
    console.log('====================');
    console.log(`  Host: ${VPS.host}`);
    console.log(`  Target: ${PROJECT_DIR}`);
    console.log('');

    // Step 1: Create tar archive
    console.log('📦 Step 1: Creating archive...');
    try {
        execSync(
            `tar -czf "${LOCAL_TAR}" --exclude=node_modules --exclude=.next --exclude=dist --exclude=.git --exclude=.gemini --exclude=.agent .`,
            { cwd: 'd:\\Ai\\TMS', stdio: 'pipe' }
        );
        const size = (readFileSync(LOCAL_TAR).length / 1024 / 1024).toFixed(1);
        console.log(`  ✅ Archive created: ${size} MB`);
    } catch (e) {
        console.error('  ❌ Failed to create archive:', e.message);
        process.exit(1);
    }

    // Step 2: Connect via SSH
    console.log('\n🔌 Step 2: Connecting to VPS...');
    const conn = new Client();

    conn.on('error', (err) => {
        console.error('  ❌ SSH error:', err.message);
        process.exit(1);
    });

    await new Promise((resolve) => {
        conn.on('ready', () => {
            console.log('  ✅ Connected');
            resolve();
        });
        conn.connect(VPS);
    });

    // Step 3: Create directory & upload
    console.log('\n📁 Step 3: Preparing server...');
    await sshExec(conn, `mkdir -p ${PROJECT_DIR}`);
    console.log(`  ✅ ${PROJECT_DIR} ready`);

    console.log('\n📤 Step 4: Uploading archive...');
    await sftpUpload(conn, LOCAL_TAR, `${PROJECT_DIR}/tms.tar.gz`);

    // Step 5: Clean old files & Extract
    console.log('\n📂 Step 5: Cleaning & extracting...');
    const extract = await sshExec(conn,
        `cd ${PROJECT_DIR} && find . -maxdepth 1 -not -name '.env' -not -name '.' -not -name 'tms.tar.gz' -exec rm -rf {} + 2>/dev/null; tar -xzf tms.tar.gz && rm tms.tar.gz && echo "OK"`,
        { stream: true });
    console.log('  ✅ Extracted (clean)');

    // Step 6: Run deploy.sh
    console.log('\n🚀 Step 6: Running deploy.sh...');
    console.log('─'.repeat(50));
    const deploy = await sshExec(conn, `cd ${PROJECT_DIR} && bash deploy.sh 2>&1`, { stream: true });
    console.log('─'.repeat(50));

    if (deploy.code === 0) {
        console.log('\n🎉 Deploy completed successfully!');
        console.log(`  API: http://${VPS.host}:4000/api/health`);
        console.log(`  Web: http://${VPS.host}:3000`);
    } else {
        console.log(`\n⚠️ Deploy exited with code ${deploy.code}`);
    }

    conn.end();
}

main().catch(console.error);
