import { Client } from 'ssh2';
import crypto from 'crypto';

const sshConfig = {
    host: '5.42.102.58',
    port: 22,
    username: 'root',
    password: 'n2ggTgRB2#P1Z6',
    readyTimeout: 20000,
};

async function createSql() {
    const seedPassword = "yo0w9cqBv99k8ymiiWkmow==";
    const { hashPassword } = await import('d:/Ai/TMS/apps/api/src/auth/auth.js').catch(e => {
        // Basic fallback if import fails
        const bcrypt = require('bcryptjs');
        return { hashPassword: (p) => bcrypt.hash(p, 10) }
    });

    const passwordHash = await hashPassword(seedPassword);

    const sql = `
-- Append-only triggers
CREATE OR REPLACE FUNCTION audit_log_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO "events" (id, entity_type, entity_id, action, changes, "user_id", created_at)
        VALUES (gen_random_uuid(), TG_TABLE_NAME, NEW.id, 'CREATE', row_to_json(NEW), current_setting('request.jwt.claim.sub', true)::uuid, now());
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO "events" (id, entity_type, entity_id, action, changes, "user_id", created_at)
        VALUES (gen_random_uuid(), TG_TABLE_NAME, NEW.id, 'UPDATE', row_to_json(NEW), current_setting('request.jwt.claim.sub', true)::uuid, now());
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO "events" (id, entity_type, entity_id, action, changes, "user_id", created_at)
        VALUES (gen_random_uuid(), TG_TABLE_NAME, OLD.id, 'DELETE', row_to_json(OLD), current_setting('request.jwt.claim.sub', true)::uuid, now());
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != 'events' AND tablename != 'drizzle_migrations'
    LOOP
        EXECUTE 'DROP TRIGGER IF EXISTS audit_trigger ON "' || r.tablename || '"';
        EXECUTE 'CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON "' || r.tablename || '" FOR EACH ROW EXECUTE FUNCTION audit_log_changes()';
    END LOOP;
END $$;

-- Truncate and restart identities
TRUNCATE TABLE users CASCADE;

-- Users
INSERT INTO users (id, email, password_hash, full_name, roles, created_at, updated_at) VALUES 
(gen_random_uuid(), 'admin@tms.local', '${passwordHash}', 'Администратор', '{"admin"}', now(), now()),
(gen_random_uuid(), 'logist@tms.local', '${passwordHash}', 'Иванов Пётр Сергеевич', '{"logist"}', now(), now()),
(gen_random_uuid(), 'dispatcher@tms.local', '${passwordHash}', 'Сидорова Мария Александровна', '{"dispatcher"}', now(), now()),
(gen_random_uuid(), 'mechanic@tms.local', '${passwordHash}', 'Козлов Андрей Иванович', '{"mechanic"}', now(), now()),
(gen_random_uuid(), 'medic@tms.local', '${passwordHash}', 'Белова Елена Викторовна', '{"medic"}', now(), now()),
(gen_random_uuid(), 'manager@tms.local', '${passwordHash}', 'Петров Алексей Павлович', '{"manager"}', now(), now()),
(gen_random_uuid(), 'accountant@tms.local', '${passwordHash}', 'Кузнецова Ольга Дмитриевна', '{"accountant"}', now(), now()),
(gen_random_uuid(), 'repair@tms.local', '${passwordHash}', 'Смирнов Дмитрий Анатольевич', '{"repair_service"}', now(), now()),
(gen_random_uuid(), 'driver1@tms.local', '${passwordHash}', 'Морозов Сергей Николаевич', '{"driver"}', now(), now()),
(gen_random_uuid(), 'driver2@tms.local', '${passwordHash}', 'Волков Артём Дмитриевич', '{"driver"}', now(), now()),
(gen_random_uuid(), 'driver3@tms.local', '${passwordHash}', 'Соколов Игорь Петрович', '{"driver"}', now(), now());

-- Vehicles
INSERT INTO vehicles (id, plate_number, vin, make, model, year, body_type, payload_capacity_kg, payload_volume_m3, fuel_tank_liters, fuel_norm_per_100km, status, created_at, updated_at) VALUES 
(gen_random_uuid(), 'А123БВ77', 'XTA21700080000001', 'ГАЗ', 'ГАЗон NEXT', 2023, 'тент', 5000, 22, 120, 18, 'active', now(), now()),
(gen_random_uuid(), 'В456ГД50', 'XTA21700080000002', 'КАМАЗ', '65207', 2022, 'борт', 15000, 45, 350, 32, 'active', now(), now()),
(gen_random_uuid(), 'Е789ЖЗ99', 'XTA21700080000003', 'MAN', 'TGX 18.510', 2024, 'рефрижератор', 20000, 86, 400, 28, 'active', now(), now()),
(gen_random_uuid(), 'К012ЛМ77', 'XTA21700080000004', 'Hyundai', 'HD78', 2023, 'фургон', 4500, 18, 100, 14, 'active', now(), now()),
(gen_random_uuid(), 'Н345ОП50', 'XTA21700080000005', 'ISUZU', 'ELF 7.5', 2024, 'тент', 4200, 20, 100, 13, 'active', now(), now());
  `;

    return sql;
}

async function run() {
    const sql = createSql();
    const cmd = `cat << 'EOF' > /tmp/seed.sql
${sql}
EOF
docker compose -f /opt/tms/docker-compose.prod.yml exec -T postgres psql -U tms -d tms -f /tmp/seed.sql
`;

    console.log("Seeding database on VPS via SQL...");
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
}

run();
