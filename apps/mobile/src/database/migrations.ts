import { schemaMigrations } from '@nozbe/watermelondb/Schema/migrations';

/**
 * WatermelonDB schema migrations.
 *
 * The list starts empty because schema is at version 1. When the schema is
 * bumped, append a migration entry here with `toVersion` and the SQL/structural
 * steps needed to bring older installs forward. Without this hook wired into
 * the adapter, a future schema bump would brick existing installs — the DB
 * would simply fail to open.
 *
 * See https://nozbe.github.io/WatermelonDB/Advanced/Migrations.html
 */
export default schemaMigrations({
    migrations: [],
});
