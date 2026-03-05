const fs = require('fs');
const path = require('path');
const { Client } = require('ssh2');

const sshConfig = {
    host: '5.42.102.58',
    port: 22,
    username: 'root',
    password: 'n2ggTgRB2#P1Z6',
    readyTimeout: 20000,
};

const localSidebar = 'd:\\Ai\\TMS\\apps\\web\\src\\components\\sidebar.tsx';
const localLogin = 'd:\\Ai\\TMS\\apps\\web\\src\\app\\login\\page.tsx';

const remoteSidebar = '/opt/tms/apps/web/src/components/sidebar.tsx';
const remoteLoginDir = '/opt/tms/apps/web/src/app/login';
const remoteLogin = '/opt/tms/apps/web/src/app/login/page.tsx';

const conn = new Client();
conn.on('ready', () => {
    console.log('SSH connection ready');
    conn.sftp((err, sftp) => {
        if (err) throw err;
        console.log('SFTP session started');

        // Upload sidebar
        sftp.fastPut(localSidebar, remoteSidebar, (err) => {
            if (err) throw err;
            console.log('Uploaded sidebar.tsx');

            // Ensure login dir exists
            conn.exec(`mkdir -p ${remoteLoginDir}`, (err, stream) => {
                if (err) throw err;
                stream.on('close', () => {
                    // Upload login page
                    sftp.fastPut(localLogin, remoteLogin, (err) => {
                        if (err) throw err;
                        console.log('Uploaded login page.tsx');

                        // Now trigger rebuild
                        console.log('Starting container rebuild...');
                        conn.exec('cd /opt/tms && docker compose -f docker-compose.prod.yml up -d --build web', (err, stream2) => {
                            if (err) throw err;
                            stream2.on('close', (code) => {
                                console.log('Rebuild complete. Exiting...');
                                conn.end();
                            }).on('data', data => process.stdout.write(data)).stderr.on('data', data => process.stderr.write(data));
                        });
                    });
                });
            });
        });
    });
}).on('error', (err) => {
    console.log('Error:', err);
}).connect(sshConfig);
