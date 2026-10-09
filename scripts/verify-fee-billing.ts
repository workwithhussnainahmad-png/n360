import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import {build} from 'esbuild';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {SQL,eq,and} from 'drizzle-orm';
import {getTableConfig,PgDialect} from 'drizzle-orm/pg-core';
import * as schema from '../src/db/schema';
async function main(){
  const queries: Array<{ query: string; params: unknown[] }> = [];
  const memory=new PGlite(),db=drizzle(memory, { logger: { logQuery(query, params) { queries.push({ query, params }); } } }),dialect=new PgDialect();
  (globalThis as typeof globalThis & {__billingDb:typeof db}).__billingDb=db;
  const dir='.codex/local-completion';await mkdir(dir,{recursive:true});
  async function load(entry:string){
    const result=await build({entryPoints:[entry],bundle:true,jsx:'automatic',write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'db',setup(b){
      b.onResolve({filter:/^@\/db$/},()=>({path:'db',namespace:'fixture'}));
      b.onResolve({filter:/manual-payment-accounts$/},()=>({path:'accounts',namespace:'fixture'}));
      b.onResolve({filter:/^@\/lib\/auth$/},()=>({path:'auth',namespace:'fixture'}));
      b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));
      b.onResolve({filter:/StudentsPageTabs$/},()=>({path:'tabs',namespace:'fixture'}));
      b.onResolve({filter:/public-site-domain$/},()=>({path:'domain',namespace:'fixture'}));
      b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='db'?'export const db=globalThis.__billingDb;':args.path==='accounts'?'export const getPaymentAccounts=async()=>[];':args.path==='auth'?'export const getSession=async()=>globalThis.__directorySession;':args.path==='navigation'?'export const redirect=url=>{throw Error(url)};':args.path==='tabs'?'export const StudentsPageTabs=()=>null;':'export const getPublicSiteBaseDomain=async()=>"example.test";'}));
    }}]});
    const file=path.resolve(dir+'/'+path.basename(entry)+'.cjs');await writeFile(file,result.outputFiles[0].text);const require=createRequire(file);delete require.cache[file];return require(file);
  }
  try {
    for(const table of [schema.institutions,schema.classes,schema.sections,schema.students,schema.feeHeads,schema.classFeeItems,schema.feeInvoices,schema.feeInvoiceItems,schema.studentFeeAdjustments,schema.feeBillingBatches,schema.feePayments,schema.feePaymentSubmissions]){
      const config=getTableConfig(table);
      const columns=config.columns.map(column=>{
        let value='';if(column.default!==undefined){const item=column.default;value=' DEFAULT '+(item instanceof SQL?dialect.sqlToQuery(item).sql:typeof item==='string'?`'${item.replaceAll("'","''")}'`:typeof item==='object'?`'${JSON.stringify(item)}'::jsonb`:String(item));}
        return `"${column.name}" ${column.columnType==='PgEnumColumn'?'text':column.getSQLType()}${column.primary?' PRIMARY KEY':''}${column.notNull?' NOT NULL':''}${value}`;
      });await memory.exec(`CREATE TABLE "${config.name}" (${columns.join(',')})`);
    }
    const migration=await readFile('drizzle/0074_explicit_fee_billing.sql','utf8');await memory.exec(migration);
    const values={name:'Fixture',type:'COLLEGE' as const,username:'school',country:'PK',city:'Test',address:'Test',contactEmail:'test@example.test',contactPhone:'0',registrationNumber:'0',pricingPlan:'BASIC' as const,logoKey:'fixture',proofDocumentKey:'fixture',adminPasswordHash:'fixture',status:'APPROVED' as const,publicSlug:'school'};
    const [root,foreign]=await db.insert(schema.institutions).values([values,{...values,username:'other',publicSlug:'other'}]).returning();
    const [schoolClass]=await db.insert(schema.classes).values({institutionId:root.id,name:'Class A'}).returning();
    const [section]=await db.insert(schema.sections).values({institutionId:root.id,classId:schoolClass.id,name:'Section A'}).returning();
    const students=await db.insert(schema.students).values([1,2].map(id=>({institutionId:root.id,name:'Student '+id,loginRollNumber:'fixture'+id,passwordHash:'fixture',classId:schoolClass.id,sectionId:section.id,yearOfJoining:2026,classRollNumber:String(id)}))).returning();
    const [head,eventHead]=await db.insert(schema.feeHeads).values([{institutionId:root.id,name:'Tuition',kind:'RECURRING' as const},{institutionId:root.id,name:'Trip',kind:'ONE_TIME' as const}]).returning();
    const billing=await load('src/lib/fee-billing.ts');
    const monthly=(month:string,preview=false)=>db.transaction<{previewHash:string;created:number;zeroTotal:number;missingStudents:number;missingAmounts:unknown[]}>(tx=>billing.issueMonthlyFees(tx,root.id,{billingMonth:month,dueDate:month+'-10'},preview));
    const preview=await monthly('2026-01',true);assert.equal(preview.missingStudents,2);assert.equal(preview.missingAmounts.length,1);
    await assert.rejects(()=>monthly('2026-01'),/missing fee amounts/);assert.equal((await db.select().from(schema.feeInvoices)).length,0);
    await db.insert(schema.classFeeItems).values({institutionId:root.id,classId:schoolClass.id,feeHeadId:head.id,amount:0});
    const freePreview=await monthly('2026-01',true);assert.equal(freePreview.zeroTotal,2);
    await db.update(schema.classFeeItems).set({amount:1});
    await assert.rejects(()=>db.transaction(tx=>billing.issueMonthlyFees(tx,root.id,{billingMonth:'2026-01',dueDate:'2026-01-10',expectedPreviewHash:freePreview.previewHash})),/changed after the preview/);
    assert.equal((await db.select().from(schema.feeInvoices)).length,0);
    await db.update(schema.classFeeItems).set({amount:0});assert.equal((await monthly('2026-01')).created,2);
    assert.ok((await db.select().from(schema.feeInvoices)).every(row=>row.status==='PAID'&&row.totalAmount===0));
    const [once]=await db.insert(schema.studentFeeAdjustments).values({institutionId:root.id,studentId:students[0].id,label:'One charge',type:'CHARGE',amount:100,frequency:'ONCE',startMonth:'2026-02'}).returning();
    await db.insert(schema.studentFeeAdjustments).values([{institutionId:root.id,studentId:students[0].id,label:'Monthly',type:'CHARGE',amount:50,frequency:'RECURRING',startMonth:'2026-02',endMonth:'2026-03'},{institutionId:root.id,studentId:students[0].id,label:'Discount',type:'DISCOUNT',amount:20,frequency:'ONCE',startMonth:'2026-02'}]);
    await memory.exec("ALTER TABLE fee_invoice_items ADD CONSTRAINT fixture_month_failure CHECK(label <> 'One charge')");
    await assert.rejects(()=>monthly('2026-02'));assert.equal((await db.select().from(schema.feeInvoices)).length,2);
    assert.equal((await db.select().from(schema.studentFeeAdjustments).where(eq(schema.studentFeeAdjustments.id,once.id)))[0].consumedInvoiceId,null);
    await memory.exec('ALTER TABLE fee_invoice_items DROP CONSTRAINT fixture_month_failure');
    assert.equal((await monthly('2026-02')).created,2);assert.equal((await monthly('2026-02')).created,0);
    const invoice=async(month:string)=>(await db.select().from(schema.feeInvoices).where(and(eq(schema.feeInvoices.studentId,students[0].id),eq(schema.feeInvoices.billingMonth,month),eq(schema.feeInvoices.billingKey,'MONTHLY'))))[0];
    assert.equal((await invoice('2026-02')).totalAmount,130);assert.ok((await db.select().from(schema.studentFeeAdjustments).where(eq(schema.studentFeeAdjustments.id,once.id)))[0].consumedInvoiceId);
    const event={batchId:randomUUID(),label:'Annual trip',feeHeadId:eventHead.id,classId:schoolClass.id,amount:400,billingMonth:'2026-02',dueDate:'2026-02-20'};
    const issue=(input:typeof event & {studentIds?:number[]}=event)=>db.transaction<{created:number;alreadyIssued:boolean}>(tx=>billing.issueOneTimeFees(tx,root.id,input));
    assert.equal((await issue()).created,2);assert.equal((await issue()).alreadyIssued,true);
    assert.equal((await issue({...event,batchId:randomUUID(),studentIds:[students[1].id]})).created,1);
    await assert.rejects(()=>issue({...event,batchId:randomUUID(),studentIds:[students[0].id,999999]}),/unavailable or outside/);
    await assert.rejects(()=>issue({...event,amount:401}),/different details/);
    await assert.rejects(()=>issue({...event,batchId:randomUUID(),feeHeadId:head.id}),/one-time fee head/);
    assert.equal((await db.select().from(schema.feeInvoices).where(eq(schema.feeInvoices.billingMonth,'2026-02'))).length,5);
    await monthly('2026-03');assert.equal((await invoice('2026-03')).totalAmount,50);
    await monthly('2026-04');assert.equal((await invoice('2026-04')).totalAmount,0);
    await db.update(schema.classes).set({name:'Class renamed'}).where(eq(schema.classes.id,schoolClass.id));assert.equal((await invoice('2026-02')).classNameAtIssue,'Class A');
    const before=await db.select().from(schema.feeInvoices);await memory.exec(migration);assert.deepEqual(await db.select().from(schema.feeInvoices),before);
    // Force an item failure and prove no batch, invoices or consumed flags survive.
    await memory.exec("ALTER TABLE fee_invoice_items ADD CONSTRAINT fixture_failure CHECK(label <> 'Fail event')");
    const invoiceCount=before.length,batchCount=(await db.select().from(schema.feeBillingBatches)).length;
    await assert.rejects(()=>issue({...event,batchId:randomUUID(),label:'Fail event'}));
    assert.equal((await db.select().from(schema.feeInvoices)).length,invoiceCount);assert.equal((await db.select().from(schema.feeBillingBatches)).length,batchCount);

    const bulkStudents=await db.insert(schema.students).values(Array.from({length:240},(_,i)=>({institutionId:root.id,name:'Bulk '+i,loginRollNumber:'bulk'+i,passwordHash:'fixture',classId:schoolClass.id,sectionId:section.id,yearOfJoining:2026,classRollNumber:'bulk'+i}))).returning();
    await db.insert(schema.studentFeeAdjustments).values(bulkStudents.map(student=>({institutionId:root.id,studentId:student.id,label:'Once',type:'CHARGE' as const,amount:10,frequency:'ONCE' as const})));
    queries.length=0;
    await monthly('2026-05');
    assert.equal(queries.filter(row=>/^update "student_fee_adjustments"/i.test(row.query)).length,1);
    assert.equal((await db.select().from(schema.studentFeeAdjustments).where(eq(schema.studentFeeAdjustments.label,'Once'))).filter(row=>row.consumedInvoiceId!==null).length,240);
    queries.length=0;
    assert.equal((await issue({...event,batchId:randomUUID(),studentIds:[bulkStudents[0].id]})).created,1);
    const recipientQuery=queries.find(row=>row.query.includes('from "students"'))!;
    assert.match(recipientQuery.query,/"students"."id" in/);
    assert.ok(recipientQuery.params.includes(bulkStudents[0].id));
    console.log('PASS: 240 once adjustments consume in one UPDATE; one-student billing filters recipients in SQL');

    const fees=await load('src/lib/student-fees.ts');
    const studentId=bulkStudents[1].id;
    // Use an otherwise empty account so full totals and old dues have known values.
    await db.delete(schema.feeInvoices).where(eq(schema.feeInvoices.studentId,studentId));
    const history=await db.insert(schema.feeInvoices).values(Array.from({length:126},(_,i)=>({institutionId:root.id,studentId,billingKind:"ONE_TIME" as const,billingLabel:"Fixture",billingKey:randomUUID(),billingMonth:i<65?'2020-01':'2026-10',dueDate:'2020-01-10',subtotal:100,totalAmount:100,paidAmount:i<65?0:100,status:i<65?'DUE' as const:'PAID' as const,createdAt:new Date('2026-01-01')}))).returning();
    await db.insert(schema.feeInvoices).values([{institutionId:root.id,studentId,billingKind:"ONE_TIME" as const,billingLabel:"Fixture",billingKey:randomUUID(),billingMonth:'2026-11',dueDate:'2026-11-10',subtotal:1500000000,totalAmount:1500000000,status:'DUE'},{institutionId:root.id,studentId,billingKind:"ONE_TIME" as const,billingLabel:"Fixture",billingKey:randomUUID(),billingMonth:'2026-11',dueDate:'2026-11-10',subtotal:1500000000,totalAmount:1500000000,paidAmount:1500000000,status:'PAID'},{institutionId:root.id,studentId,billingKind:"ONE_TIME" as const,billingLabel:"Fixture",billingKey:randomUUID(),billingMonth:'2026-12',dueDate:'2026-12-10',subtotal:500,totalAmount:500,status:'VOID'}]);
    queries.length=0;
    const account=await fees.getStudentFeeAccount(root.id,studentId);
    assert.deepEqual(account.summary,{billed:3000012600,paid:1500006100,balance:1500006500});
    assert.equal(account.activePagination.total,66);assert.equal(account.paidPagination.total,62);
    assert.ok(account.invoices.length<=40);
    assert.ok(!queries.some(row=>/from "fee_invoice_items"|from "fee_payments"/.test(row.query)));
    const seen=new Set<number>();
    for(let page=1;page<=4;page++){
      const data=await fees.getStudentFeeAccount(root.id,studentId,page,page);
      for(const invoice of data.invoices){assert.ok(!seen.has(invoice.id));seen.add(invoice.id);}
    }
    assert.equal(seen.size,128);
    const clamped=await fees.getStudentFeeAccount(root.id,studentId,999999,999999);assert.equal(clamped.activePagination.page,4);assert.equal(clamped.paidPagination.page,4);
    const empty=await fees.getStudentFeeAccount(foreign.id,studentId);assert.equal(empty.invoices.length,0);assert.equal(empty.summary.billed,0);
    await db.insert(schema.feeInvoiceItems).values(Array.from({length:105},(_,i)=>({invoiceId:history[0].id,label:'Item '+i,type:'FEE' as const,amount:1})));
    await db.insert(schema.feePayments).values(Array.from({length:61},(_,i)=>({institutionId:root.id,studentId,invoiceId:history[0].id,receiptNumber:'RC-'+i,amount:1,method:'CASH' as const,recordedBy:1})));
    const itemIds=new Set<number>(),receiptIds=new Set<number>();
    for(let page=1;page<=3;page++){
      const details=await fees.getStudentFeeDetails(root.id,studentId,history[0].id,page);
      assert.ok(details);assert.equal(details.hasMore,page<3);
      for(const item of details.items){assert.ok(!itemIds.has(item.id));itemIds.add(item.id);}
      for(const receipt of details.payments){assert.ok(!receiptIds.has(receipt.id));receiptIds.add(receipt.id);assert.equal(typeof receipt.receivedAt,'string');}
    }
    assert.equal(itemIds.size,105);assert.equal(receiptIds.size,61);
    assert.equal(await fees.getStudentFeeDetails(foreign.id,studentId,history[0].id),null);
    assert.equal(await fees.getStudentFeeDetails(root.id,bulkStudents[0].id,history[0].id),null);
    console.log('PASS: complete totals above int range; 128 invoices and old dues paged without loss; lazy details, tenant/student ownership, 105 items and 61 receipts paged stably');

    (globalThis as typeof globalThis & {__directorySession:unknown}).__directorySession={role:'INSTITUTION',userId:root.id,institutionId:root.id};
    const directory=await load('src/app/(institution)/institution/students/page.tsx');
    const filteredPage=await directory.default({searchParams:Promise.resolve({q:'Bulk 239',classId:String(schoolClass.id),limit:'1000000',page:'9999999'})});
    const filteredProps=filteredPage.props.children.props;
    assert.equal(filteredProps.limit,100);assert.equal(filteredProps.page,1);assert.equal(filteredProps.totalCount,1);assert.equal(filteredProps.students[0].id,bulkStudents[239].id);
    const directoryIds=new Set<number>();
    for(let page=1;page<=5;page++){
      const rendered=await directory.default({searchParams:Promise.resolve({page:String(page),limit:'50'})});
      for(const student of rendered.props.children.props.students){assert.ok(!directoryIds.has(student.id));directoryIds.add(student.id);}
    }
    assert.equal(directoryIds.size,242);
    const badLimit=await directory.default({searchParams:Promise.resolve({limit:'-1',page:'-1',classId:'999999'})});
    assert.equal(badLimit.props.children.props.limit,50);assert.equal(badLimit.props.children.props.students.length,0);
    delete (globalThis as typeof globalThis & {__directorySession?:unknown}).__directorySession;
    console.log('PASS: actual directory SSR bounds/clamps requests, searches beyond first page and traverses 242 tied-date rows without repeats');
    const tls=await load('src/lib/tenant-tls.ts');const oldDomain=process.env.APP_DOMAIN;process.env.APP_DOMAIN='example.test';
    try {
      assert.equal(await tls.isAllowedTlsHostname('school.example.test'),true);
      for(const bad of ['evil.test','school.evil.test','unknown.example.test','school..example.test','*.example.test','127.0.0.1','https://school.example.test'])assert.equal(await tls.isAllowedTlsHostname(bad),false,bad);
      await db.insert(schema.institutions).values({...values,username:'green',publicSlug:null,parentInstitutionId:root.id,campusName:'Green'});
      assert.equal(await tls.isAllowedTlsHostname('school.green.example.test'),true);assert.equal(await tls.isAllowedTlsHostname('school.wrong.example.test'),false);
      await db.update(schema.institutions).set({status:'REJECTED'}).where(eq(schema.institutions.id,root.id));assert.equal(await tls.isAllowedTlsHostname('school.example.test'),false);assert.equal(await tls.isAllowedTlsHostname('school.green.example.test'),false);
      assert.equal(await tls.isAllowedTlsHostname('student.example.test'),true);assert.equal(await tls.isAllowedTlsHostname('other.example.test'),true);
      await db.update(schema.institutions).set({deletedAt:new Date()}).where(eq(schema.institutions.id,foreign.id));assert.equal(await tls.isAllowedTlsHostname('other.example.test'),false);
    } finally {if(oldDomain===undefined)delete process.env.APP_DOMAIN;else process.env.APP_DOMAIN=oldDomain;}
    console.log('PASS: monthly preview/missing vs zero amounts; one-time/monthly coexistence and idempotency; adjustment once/period consumption; atomic rollback; snapshots and migration replay; approved/deleted/nested tenant TLS hosts.');
  } finally {await memory.close();delete (globalThis as typeof globalThis & {__billingDb?:typeof db}).__billingDb;}
}
main().catch(error=>{console.error(error);process.exitCode=1});
