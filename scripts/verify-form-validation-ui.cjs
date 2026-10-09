const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const esbuild = require('esbuild');

(async () => {
  const dir = '.codex/form-validation'; fs.mkdirSync(dir, { recursive: true });
  const entry = `import React from 'react'; import {createRoot} from 'react-dom/client';
import {ActionForm} from '../../src/components/ui/action-form';
import {Input} from '../../src/components/ui/input'; import {Textarea} from '../../src/components/ui/textarea';
import {SubmitButton} from '../../src/components/ui/submit-button';
import FormValidationFeedback from '../../src/components/FormValidationFeedback';
createRoot(document.getElementById('root')!).render(<><FormValidationFeedback/><ActionForm action={async()=>{window.calls++;await new Promise(resolve=>setTimeout(resolve,150));return window.calls===1?{ok:false,error:'Email: This email is already in use.',fieldErrors:{email:['This email is already in use.']}}:{ok:true,data:{success:true}}}} className="space-y-4"><label>Name<Input name="name" required/></label><label>Email<Input name="email" type="email" required/></label><label>Amount<Input name="amount" type="number" min={1} max={1000} required/></label><label>Reason<Textarea name="reason" required minLength={8}/></label><SubmitButton>Save</SubmitButton></ActionForm></>);`;
  fs.writeFileSync(dir + '/entry.tsx', entry);
  const js = (await esbuild.build({ entryPoints: [dir + '/entry.tsx'], bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'offline-toast', setup(builder) { builder.onResolve({ filter: /^@\/components\/ui\/toaster$|^\.\/toaster$/ }, () => ({ path: 'toast', namespace: 'fixture' })); builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const toast=message=>window.messages.push(message);' })); } }] })).outputFiles[0].text;
  const css = fs.readdirSync('.next/static/css').filter(x => x.endsWith('.css')).map(x => fs.readFileSync('.next/static/css/' + x, 'utf8')).join('');
  const checks = `window.calls=0;window.messages=[];const checks=[];
function check(name,ok){checks.push({name,ok,overflow:document.documentElement.scrollWidth>innerWidth})}
function form(){return document.querySelector('form')}function field(name){return form().querySelector('[name='+name+']')}
function fill(name,value){const input=field(name);const proto=input instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}))}
setTimeout(()=>{form().requestSubmit()},700);
setTimeout(()=>{check('required field produces alert and inline error without API call',window.calls===0&&window.messages.at(-1).description.includes('required')&&field('name').getAttribute('aria-invalid')==='true');fill('name',' ');fill('email','person@example.test');fill('amount','100');fill('reason','A valid reason');form().requestSubmit()},1200);
setTimeout(()=>{check('whitespace-only required value blocks submission',window.calls===0&&field('name').validity.customError);fill('name','A student');fill('email','invalid-email');form().requestSubmit()},1700);
setTimeout(()=>{check('email format produces clear alert',window.calls===0&&window.messages.at(-1).description.includes('valid email'));fill('email','person@example.test');fill('amount','1001');form().requestSubmit()},2200);
setTimeout(()=>{check('numeric maximum produces exact limit',window.calls===0&&window.messages.at(-1).description.includes('1000'));fill('amount','100');form().requestSubmit();form().requestSubmit()},2700);
setTimeout(()=>{check('server field error retains input and prevents duplicate pending calls',window.calls===1&&field('name').value==='A student'&&field('email').value==='person@example.test'&&field('email').getAttribute('aria-invalid')==='true'&&document.getElementById("root").textContent.includes('already in use')&&!document.querySelector('button').disabled);fill('email','other@example.test')},3300);
setTimeout(()=>{check('editing removes stale server field error',field('email').getAttribute('aria-invalid')!=='true');form().requestSubmit()},3700);
setTimeout(()=>{check('successful correction resets form',window.calls===2&&field('name').value===''&&!document.getElementById("root").textContent.includes('already in use'));const pre=document.createElement('pre');pre.id='checks';pre.textContent=JSON.stringify(checks);document.body.appendChild(pre)},4300);`;
  const browser = process.env.BROWSER_BIN || ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(file => fs.existsSync(file));
  if (!browser) throw Error('Set BROWSER_BIN to a Chromium browser for offline validation checks.');
  for (const width of [1280, 390, 320]) {
    const file = path.resolve(`${dir}/form-${width}.html`);
    fs.writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>${css}</style></head><body style="padding:16px"><main id="root" style="max-width:${width - 32}px"></main><script>${checks}</script><script>${js}</script></body></html>`);
    const result = cp.spawnSync(browser, ['--headless', '--disable-gpu', '--no-first-run', '--no-sandbox', '--allow-file-access-from-files', '--user-data-dir=' + path.resolve(`${dir}/browser-${width}`), '--window-size=' + width + ',900', '--virtual-time-budget=5500', '--dump-dom', new URL('file:///' + file.replaceAll('\\', '/')).href], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    fs.writeFileSync(`${dir}/form-${width}-dom.html`, result.stdout || '');
    const match = result.stdout?.match(/<pre id="checks">([^<]+)<\/pre>/);
    if (!match) throw Error('Missing offline form results at ' + width + ': ' + result.stderr?.slice(-500));
    const results = JSON.parse(match[1]);
    if (results.length !== 7 || results.some(check => !check.ok || check.overflow)) throw Error(width + ': ' + JSON.stringify(results));
    console.log(`PASS: native validation, whitespace, email/range, API field errors, retained values, correction, pending duplicate prevention at ${width}px.`);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

