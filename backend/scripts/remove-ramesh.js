require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const target = 'Ramesh Pandurang Kadam';
  try {
    const sessions = await prisma.session.findMany({
      where: { OR: [{ patientName: target }, { abhaId: '12-3456-7890-1234' }] },
      select: { token: true, patientName: true },
    });
    if (!sessions.length) {
      console.log('No Ramesh Pandurang Kadam consultation records found.');
      return;
    }
    const tokens = sessions.map((s) => s.token);
    const result = await prisma.session.deleteMany({ where: { token: { in: tokens } } });
    console.log(`Deleted ${result.count} consultation record(s) for ${target}.`);
  } catch (error) {
    console.error('Could not remove Ramesh consultation records:', error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
