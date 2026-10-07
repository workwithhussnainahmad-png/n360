import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { employees } from '@/db/schema';
import { hash } from '@node-rs/argon2';
import { requireRole } from '@/lib/rbac';
import { z } from 'zod';
import { sendEmail, AccountCreatedEmail } from '@/lib/email';
import { logAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/client-ip';

const createEmployeeSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
}).strict();

export const POST = requireRole(['SUPER_ADMIN'], async (req: NextRequest, { session }) => {
  const body = await req.json();
  const parsed = createEmployeeSchema.safeParse(body);
  
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { name, email } = parsed.data;
  const initialPassword = '1234567890';
  const passwordHash = await hash(initialPassword);

  try {
    const [emp] = await db.insert(employees).values({
      name,
      email,
      passwordHash,
      mustChangePassword: true,
    }).returning();

    await logAudit({
      actorId: session.userId,
      actorRole: session.role,
      action: 'CREATE_EMPLOYEE',
      target: `Employee ${emp.id}`,
      ip: getClientIp(req),
    });

    await sendEmail({
      to: email,
      subject: 'Account Created',
      html: AccountCreatedEmail({ name, role: 'Employee', email, initialPassword }),
    });

    return NextResponse.json({ message: 'Employee created successfully' }, { status: 201 });
  } catch (err: any) {
    if (err.code === '23505') {
      return NextResponse.json({ error: 'Email already exists' }, { status: 409 });
    }
    console.error(err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
});

export const GET = requireRole(['SUPER_ADMIN'], async (req: NextRequest) => {
  const list = await db.select({
    id: employees.id,
    name: employees.name,
    email: employees.email,
    createdAt: employees.createdAt,
  }).from(employees);

  return NextResponse.json(list);
});
