const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const esbuild = require('esbuild');
const dir = '.codex/request-cost-fixes';
fs.mkdirSync(dir, { recursive: true });
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';
import {StudentFeesClient} from '../../src/app/(student)/student/vouchers/StudentFeesClient';
import {FeesManager} from '../../src/app/(institution)/institution/fees/FeesManager';
import {StaffAttendanceClient} from '../../src/app/(institution)/institution/staff-attendance/StaffAttendanceClient';
import {TestMarksEntry} from '../../src/app/(staff)/staff/marks/TestMarksEntry';
import Courses from '../../src/app/(institution)/institution/courses/page';
import {IdCardsClient} from '../../src/app/(institution)/institution/students/id-cards/IdCardsClient';
import {TicketsClient} from '../../src/components/tickets/TicketsClient';
const root=createRoot(document.getElementById('root'));
window.renderFixture=name=>root.render(name==='student'?<StudentFeesClient key={name} initialData={window.seedFees}/>:
name==='collections'?<FeesManager key={name} mode="collections"/>:name==='billing'?<FeesManager key={name} mode="billing"/>:
name==='attendance'?<StaffAttendanceClient key={name} staffMembers={[{id:1,name:'Teacher'}]}/>:
name==='marks'?<TestMarksEntry key={name} testId={1} classId={1} maxMarks={100} fixedSectionId={null} sectionOptions={[{sectionId:1,classId:1,className:'A',sectionName:'First'},{sectionId:2,classId:1,className:'A',sectionName:'Second'}]}/>:
name==='courses'?<Courses key={name}/>:name==='cards'?<IdCardsClient key={name} initialStudentId={1}/>:<TicketsClient key={name} initialTickets={[]}/>);
window.renderFixture('student');`;
fs.writeFileSync(dir + '/entry.tsx', entry);
const mock = `
window.process={env:{NODE_ENV:"production"}};const checks=[],gets=[],posts=[],reads=[];const errors=[];window.addEventListener("error",event=>errors.push(event.message));
const invoice={id:1,billingMonth:'2020-01',billingKind:'MONTHLY',dueDate:'2020-01-10',status:'DUE',totalAmount:100,paidAmount:0};
window.seedFees={invoices:[invoice],submissions:[],paymentAccounts:[],summary:{billed:3100,paid:0,balance:3100},activePagination:{page:1,pages:2,total:31,pageSize:20},paidPagination:{page:1,pages:1,total:0,pageSize:20}};
window.testGet=async(url)=>{gets.push(url);const params=new URL(url,'http://fixture.test').searchParams;
if(url.startsWith('/api/student/fees'))return params.has('invoiceId')?{items:[{id:1,invoiceId:1,label:'Tuition',type:'FEE',amount:100}],payments:[],page:1,hasMore:false}:{...window.seedFees,invoices:[{...invoice,id:21}],activePagination:{page:2,pages:2,total:31,pageSize:20}};
if(url.startsWith('/api/institution/students/id-cards'))return {institution:{name:'School',logoKey:'',signatureKey:null,address:'Fixture',contactPhone:'0'},students:[{id:1,name:'Student',classRollNumber:'1',className:'A',sectionName:'First',loginRollNumber:'1',verificationQr:'data:image/png;base64,AA',fatherName:null,phone:null,emergencyContact:null,profilePictureUrl:null}]};
if(url==='/api/tickets')return {tickets:[{id:1,title:'Fixture',description:'Test',status:'OPEN',createdAt:'2026-10-01'}],nextCursor:null};
return {heads:[{id:1,name:'Tuition',kind:'RECURRING',isActive:true}],classes:[{id:1,name:'A'}],classItems:[],invoices:[{...invoice,studentId:1,studentName:'Student',loginRollNumber:'1',balance:100,className:'A',sectionName:''}],submissions:[],pagination:{page:Number(params.get('page')||1),pages:3,pageSize:50,total:101},summary:{invoiceCount:101,billed:10100,collected:0,outstanding:10100,defaulters:101}};
};
window.testPost=async(url,body)=>{posts.push({url,body});if(body.action==='previewMonth')return {previewHash:'a'.repeat(64),eligible:1,alreadyBilled:0,ready:1,missingStudents:0,missingAmounts:[],zeroTotal:0,totalAmount:100};
if(body.action==='getAdjustmentsByRollNumber')return {adjustments:[{id:1,label:'Concession',type:'DISCOUNT',amount:10,frequency:'ONCE',consumedInvoiceId:null}]};return {created:1};};
window.fetch=(url,options={})=>{const query=new URL(url,'http://fixture.test');reads.push({url,signal:options.signal,body:options.body});let data={},delay=0;
if(url.startsWith('/api/institution/staff-attendance')){const date=query.searchParams.get('date');if(options.method==='POST')data={success:true};else {data={records:[{staffId:1,status:date==='2026-10-11'?'ABSENT':'PRESENT'}]};delay=date==='2026-10-10'?1300:100;}}
if(url.startsWith('/api/staff/marks')){const id=query.searchParams.get('sectionId');data={rosters:{[id]:[{id:Number(id),name:id==='1'?'Old roster':'New roster',rollNumber:id}]},marks:{}};delay=id==='1'?1300:100;}
if(url.startsWith('/api/institution/courses')){const id=query.searchParams.get('id');data=id?{course:{id:Number(id),title:id==='1'?'Old course':'New course',teacherName:'Teacher',subjectName:'Math',plannedLectures:1},lectures:[],classes:[]}:{courses:[{id:1,title:'Old course',teacherName:'Teacher',subjectName:'Math',plannedLectures:1,addedLectures:0},{id:2,title:'New course',teacherName:'Teacher',subjectName:'Math',plannedLectures:1,addedLectures:0}]};delay=id==='1'?1300:100;}
return new Promise(resolve=>setTimeout(()=>resolve(new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}})),delay));};
function button(text){return [...document.querySelectorAll('button')].find(button=>button.textContent.trim()===text)}
function check(label,ok){checks.push({label,ok:Boolean(ok),gets:[...gets],errors:[...errors],debug:label.startsWith("marks")?{text:document.getElementById("root").textContent.slice(0,1500),fields:[...document.querySelectorAll("input")].map(input=>({name:input.name,value:input.value})),reads:reads.filter(read=>read.url.includes("/marks")).map(read=>({url:read.url,aborted:read.signal.aborted}))}:undefined});}
function fill(input,value,event='input'){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event(event,{bubbles:true}));}
function select(input,value){input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}));}
setTimeout(()=>{check('SSR fee seed eliminates mount GET and includes full totals',gets.length===0&&document.getElementById("root").textContent.includes('3,100'));document.querySelector('button.flex-1').click()},500);
setTimeout(()=>{check('invoice details loaded once on expansion',gets.length===1&&gets[0].includes('invoiceId=1')&&document.getElementById("root").textContent.includes('Tuition'));document.querySelector('button.flex-1').click()},850);
setTimeout(()=>{document.querySelector('button.flex-1').click()},1050);
setTimeout(()=>{check('same invoice expansion reuses details',gets.length===1);button('Next').click()},1300);
setTimeout(()=>{check('old dues pagination uses one account GET',gets.length===2&&gets[1].includes('activePage=2'));window.renderFixture('collections')},1750);
setTimeout(()=>{button('Next').click()},2200);
setTimeout(()=>{const url=gets.at(-1);check('fee paging omits cached metadata and summary',url.includes('page=2')&&url.includes('meta=0')&&url.includes('summary=0'));window.renderFixture('billing')},2600);
setTimeout(()=>{const form=document.querySelector('input[name=billingMonth]').closest('form');form.querySelector('[name=billingMonth]').value='2026-12';form.querySelector('[name=dueDate]').value='2026-12-10';form.requestSubmit()},3200);
setTimeout(()=>{window.beforeBillingGets=gets.length;button('Generate previewed challans').closest('form').requestSubmit()},3700);
setTimeout(()=>{check('changed billing month reloads exactly once',gets.length===window.beforeBillingGets+1);button('Reset').click()},4200);
setTimeout(()=>{fill(document.querySelector('input[placeholder="Roll number"]'),'1')},4500);
setTimeout(()=>{button('Search').closest('form').requestSubmit()},4800);
setTimeout(()=>{button('Remove').click()},5100);
setTimeout(()=>{check('both reset actions use API URL',posts.filter(post=>['getAdjustmentsByRollNumber','removeAdjustment'].includes(post.body.action)).length===2&&posts.every(post=>post.url==='/api/institution/fees'));window.renderFixture('attendance')},5500);
setTimeout(()=>{fill(document.querySelector('#date'),'2026-10-10','change')},5900);
setTimeout(()=>{fill(document.querySelector('#date'),'2026-10-11','change');check('saving disabled for an unloaded date',button('Save').disabled)},6200);
setTimeout(()=>{button('Save').click()},6650);
setTimeout(()=>{const saved=reads.find(read=>read.body&&read.url==='/api/institution/staff-attendance');check('attendance save uses current date and roster',saved&&JSON.parse(saved.body).date==='2026-10-11'&&JSON.parse(saved.body).records[0].status==='ABSENT')},6900);
setTimeout(()=>{check('old attendance response aborted and ignored',reads.find(read=>read.url.includes('date=2026-10-10')).signal.aborted&&document.querySelector('[role=combobox]').textContent.includes('Absent'));window.renderFixture('marks')},7500);
setTimeout(()=>{document.querySelector('details').open=true},8000);
setTimeout(()=>{select(document.querySelector('select'),'2')},8350);
setTimeout(()=>{check('marks roster response uses newest section',document.getElementById("root").textContent.includes('New roster')&&!document.getElementById("root").textContent.includes('Old roster')&&document.querySelector('input[name=sectionId]').value==='2'&&reads.find(read=>read.url.includes('sectionId=1')).signal.aborted);window.renderFixture('courses')},9800);
setTimeout(()=>{[...document.querySelectorAll('button')].find(button=>button.textContent.includes('Old course')).click()},10200);
setTimeout(()=>{[...document.querySelectorAll('button')].find(button=>button.textContent.includes('New course')).click()},10500);
setTimeout(()=>{check('obsolete course response aborted and ignored',reads.find(read=>read.url.includes('courses?id=1')).signal.aborted&&document.querySelector('[role=dialog]').textContent.includes('New course'));window.renderFixture('tickets')},12100);
setTimeout(()=>{[...document.querySelectorAll('button')].find(button=>button.textContent.includes('Create ticket')).click()},12500);
setTimeout(()=>{document.querySelector('input[name=title]').value='Fixture';document.querySelector('textarea[name=description]').value='Fixture ticket';button('Submit Ticket').closest('form').requestSubmit()},13000);
setTimeout(()=>{check('ticket creation performs one list refresh',gets.filter(url=>url==='/api/tickets').length===1);window.renderFixture('cards')},13700);
setTimeout(()=>{[...document.querySelectorAll('button')].find(button=>button.textContent.includes('Preview (1)')).click()},14300);
setTimeout(()=>{check('same card selection reuses preview without a second GET',gets.filter(url=>url.startsWith('/api/institution/students/id-cards')).length===1);const result=document.createElement('pre');result.id='checks';result.textContent=JSON.stringify(checks);document.body.appendChild(result)},15000);
`;
(async () => {
  const result = await esbuild.build({ entryPoints: [dir + '/entry.tsx'], bundle: true, write: false, platform: 'browser', format: 'iife', loader: { '.css': 'empty' }, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'fixture', setup(builder) {
    builder.onResolve({ filter: /\.module\.css$/ }, () => ({ path: 'css', namespace: 'css-fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'css-fixture' }, () => ({ contents: 'export default {};' }));
    const mocks = { '@/lib/api-client': 'export class ApiError extends Error {} export const api={get:window.testGet,post:window.testPost};', '@/components/ui/toaster': 'const toast=()=>{};export const useToast=()=>({toast});', '@/app/actions/feedback-actions': 'export const enterMarksManuallyWithFeedback=async()=>({success:true});' };
    builder.onResolve({ filter: /^@\// }, args => mocks[args.path] ? { path: args.path, namespace: 'fixture' } : undefined);
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path] }));
  } }] });
  const css = fs.readdirSync('.next/static/css').filter(file => file.endsWith('.css')).map(file => fs.readFileSync('.next/static/css/' + file, 'utf8')).join('');
  const browser = process.env.BROWSER_BIN || ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(file => fs.existsSync(file));
  if (!browser) throw Error('Set BROWSER_BIN to a Chromium browser');
  for (const width of [1280, 390, 320]) {
    const file = path.resolve(dir + '/ui-' + width + '.html');
    fs.writeFileSync(file, '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>' + css + '</style></head><body style="padding:16px"><main id="root" style="max-width:' + (width - 32) + 'px"></main><script>' + mock + '</script><script>' + result.outputFiles[0].text + '</script></body></html>');
    const out = cp.spawnSync(browser, ['--headless', '--disable-gpu', '--no-first-run', '--no-sandbox', '--allow-file-access-from-files', '--user-data-dir=' + path.resolve(dir + '/browser-' + width), '--window-size=' + width + ',900', '--virtual-time-budget=16000', '--dump-dom', new URL('file:///' + file.replaceAll('\\', '/')).href], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    fs.writeFileSync(dir + '/ui-' + width + '-dom.html', out.stdout);
    const match = out.stdout.match(/<pre id="checks">([^<]+)<\/pre>/);
    if (!match) throw Error('Missing browser checks: ' + width);
    const checks = JSON.parse(match[1].replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>'));
    fs.writeFileSync(dir + '/ui-' + width + '-checks.json', JSON.stringify(checks, null, 2));
    if (checks.length !== 14 || checks.some(check => !check.ok)) throw Error(width + ': ' + JSON.stringify(checks));
    console.log('PASS: 14 actual-component request/seed/lazy-detail/pagination/reset/stale-read/ticket checks at ' + width + 'px');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
