import bcrypt from 'bcryptjs';
import { db } from '../src/db/connection.js';
import { users } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

async function main() {
    const email = process.env.RESET_EMAIL || 'admin@tms.local';
    const newPassword = process.env.NEW_PASSWORD;

    if (!newPassword) {
        console.error('NEW_PASSWORD is required');
        console.error('Example: NEW_PASSWORD=Admin123! npm run auth:reset-password --workspace=@tms/api');
        process.exit(1);
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    const [updated] = await db
        .update(users)
        .set({
            passwordHash,
            isActive: true,
            updatedAt: new Date(),
        })
        .where(eq(users.email, email))
        .returning({
            id: users.id,
            email: users.email,
            isActive: users.isActive,
            updatedAt: users.updatedAt,
        });

    if (!updated) {
        console.error(`User not found: ${email}`);
        process.exit(1);
    }

    console.log(`Password reset OK for ${updated.email}`);
    console.log(`isActive=${updated.isActive}, updatedAt=${updated.updatedAt?.toISOString?.() ?? updated.updatedAt}`);
}

main().catch((err) => {
    console.error('Password reset failed:', err);
    process.exit(1);
});

