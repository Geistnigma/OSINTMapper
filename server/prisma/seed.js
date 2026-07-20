import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.user.findUnique({ where: { username: 'admin' } });
  const hash = await bcrypt.hash('admin', 12);
  if (!existing) {
    await prisma.user.create({
      data: {
        username: 'admin',
        displayName: 'Administrateur',
        passwordHash: hash,
        role: 'ADMIN',
      },
    });
    console.log('  👤 Default admin created (admin / admin)');
  } else {
    // Reset password to ensure it works after bcrypt→bcryptjs migration
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash: hash },
    });
    console.log('  👤 Admin password reset (admin / admin)');
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
