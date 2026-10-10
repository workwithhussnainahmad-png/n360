const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const esbuild = require('esbuild');
const toolsDir = process.env.BROWSER_TOOLS_PATH || path.join(process.env.TEMP || '', 'nisaab-destroyer-browser-tools/node_modules/playwright');
const { chromium } = require(toolsDir);
const dir = '.codex/public-site-builder';
async function main() {
  fs.mkdirSync(dir, { recursive: true });
  const entry = `import React from 'react';import {createRoot} from 'react-dom/client';
import {WebsiteEventsManager} from '../../src/app/(institution)/institution/website-events/WebsiteEventsManager';
import {PublicWebsiteEditor} from '../../src/app/(institution)/institution/settings/PublicWebsiteEditor';
import {InstitutionHomepage} from '../../src/app/sites/[slug]/[[...path]]/InstitutionHomepage';
import {EventPageContent} from '../../src/components/public-site/EventPageContent';
import {EMPTY_WEBSITE_NOTICES} from '../../src/lib/public-website-notices';
import {makePublicBlock} from '../../src/lib/public-site-builder';
const root=createRoot(document.getElementById('root')!);
const tenant={id:1,name:'Fixture Academy',type:'SCHOOL',publicSlug:'fixture',logoKey:'',city:'Lahore',country:'Pakistan',theme:'default',accentColor:'#233c32',admissionsEnabled:true,tagline:'Learn with purpose.',description:'A community of curious learners.',heroImageUrl:'https://assets.example.test/cover.svg',announcementText:null,announcementLink:null,aboutTitle:'Our story',mission:'Learn together.',vision:'Build a brighter future.',principalName:'Fixture Principal',principalTitle:'Principal',principalMessage:'Every learner deserves a place to thrive.',principalImageUrl:null,statistics:[{value:'800+',label:'Learners'}],programs:[{title:'Primary school',description:'The foundations of learning.'}],highlights:[{title:'Science labs',description:'Learning through discovery.'}],galleryImages:[{url:'https://assets.example.test/campus.svg',caption:'Our campus'}],publicEmail:'hello@example.test',publicPhone:'+9212345',publicAddress:'Main campus, Lahore',mapUrl:null,facebookUrl:null,instagramUrl:null,youtubeUrl:null,websiteNotices:EMPTY_WEBSITE_NOTICES};
const events=[{id:1,title:'Live open day',slug:'open-day',summary:'A day to discover.',coverImageUrl:'',eventDate:'Saturday, 10 AM',venue:'Main campus',blocks:[{id:'heading-1',type:'heading',text:'Welcome families'}],design:{},status:'PUBLISHED',visibilityDuration:'FOREVER',publishedAt:'2026-10-01T00:00:00Z',expiresAt:null,createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:00:00Z'},{id:2,title:'Draft workshop',slug:'draft-workshop',summary:'',coverImageUrl:'',eventDate:'',venue:'',blocks:[],status:'DRAFT',visibilityDuration:'ONE_WEEK',publishedAt:null,expiresAt:null,createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:00:00Z'}];
const summaries=events.map(({blocks,design,summary,coverImageUrl,eventDate,venue,...metadata})=>({...metadata,blockCount:blocks.length}));
window.renderStudio=(options={})=>root.render(<WebsiteEventsManager key={Math.random()} institutionName={tenant.name} publicBaseUrl="https://fixture.example.test" publicSiteEnabled readOnly={options.readOnly} initialEvents={options.many?[...summaries,...Array.from({length:25},(_,index)=>({...summaries[1],id:1000+index,title:'Fixture event '+(index+1),slug:'fixture-'+index}))]:summaries}/>);
window.renderEditor=()=>root.render(<PublicWebsiteEditor key={Math.random()} publicSlug="fixture" publicSiteEnabled publicUrl="https://fixture.example.test" qrUrl={null} eventLinks={[]} initialProfile={tenant} previewIdentity={tenant} previewEvents={[]}/>);
window.renderSite=(theme,design)=>root.render(<InstitutionHomepage preview tenant={{...tenant,theme,design}} baseDomain="example.test" studentLoginUrl="/student-login" publicEvents={events}/>);
window.renderEvent=(hero)=>root.render(<EventPageContent institutionName={tenant.name} event={{...events[0],coverImageUrl:tenant.heroImageUrl,design:{hero,accent:'#184862'},blocks:[{id:'gallery',type:'gallery',columns:3,images:Array.from({length:3},(_,i)=>({url:'https://assets.example.test/image'+i+'.svg',alt:'Campus '+i,caption:'Campus life'}))},makePublicBlock('split'),makePublicBlock('faq'),makePublicBlock('list'),makePublicBlock('divider')]}}/>);
window.requests=[];window.rejectNext=false;
window.testApi=async(method,url,body)=>{window.requests.push({method,url,body});if(window.rejectNext){window.rejectNext=false;throw Error('Fixture save failed. Please retry.')}if(method==='GET')return {event:events.find(event=>event.id===Number(url.split('/').at(-1)))};return {event:{...events[0],...body,id:101,status:body.action==='PUBLISH'?'PUBLISHED':body.action==='UNPUBLISH'?'DRAFT':body.action==='SAVE'?'PUBLISHED':'DRAFT'}}};
window.renderStudio();`;
  fs.writeFileSync(dir + '/ui-entry.tsx', entry);
  const output = await esbuild.build({ entryPoints: [dir + '/ui-entry.tsx'], bundle: true, write: true, outdir: dir + '/bundle', platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'browser-fixtures', setup(builder) {
    builder.onResolve({ filter: /^(next\/image|next\/link|@\/lib\/api-client)$/ }, (args) => ({ path: args.path, namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({ loader: 'tsx', resolveDir: process.cwd(), contents: args.path === 'next/image' ? 'import React from "react";export default function Image({fill,unoptimized,priority,sizes,placeholder,blurDataURL,...props}) {return <img {...props} style={fill?{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}:props.style}/>;}' : args.path === 'next/link' ? 'import React from "react";export default function Link({children,...props}){return <a {...props}>{children}</a>}' : 'export const api={get:(url)=>window.testApi("GET",url),post:(url,body)=>window.testApi("POST",url,body),patch:(url,body)=>window.testApi("PATCH",url,body),delete:(url)=>window.testApi("DELETE",url)};' }));
  } }] });
  assert.ok(output);
  const globalCss = fs.readdirSync('.next/static/css').filter((name) => name.endsWith('.css')).map((name) => fs.readFileSync('.next/static/css/' + name, 'utf8')).join('\n');
  const css = globalCss + '\n' + fs.readFileSync(dir + '/bundle/ui-entry.css', 'utf8');
  const js = fs.readFileSync(dir + '/bundle/ui-entry.js', 'utf8');
  const file = path.resolve(dir + '/fixture.html');
  fs.writeFileSync(file, '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + '</style></head><body><main id="root" class="p-4 sm:p-6"></main><script>' + js.replaceAll('</script', '<\\/script') + '</script></body></html>');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://**/*', async (route) => {
    if (route.request().resourceType() === 'image') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#95b3a4"/><rect x="160" y="240" width="880" height="470" fill="#e9e3d1"/></svg>' });
    return route.abort();
  });
  const evidence = [];
  const checkFit = async (label) => {
    const fit = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, nodes: Array.from(document.querySelectorAll('*')).filter((node) => node.getBoundingClientRect().right > innerWidth + 1).slice(0, 12).map((node) => ({ tag: node.tagName, class: node.className, width: node.getBoundingClientRect().width, right: node.getBoundingClientRect().right })) }));
    if (fit.scrollWidth > fit.width) { fs.writeFileSync(dir + '/overflow.json', JSON.stringify({ label, ...fit }, null, 2)); await page.screenshot({ path: dir + '/overflow.png' }); }
    assert.ok(fit.scrollWidth <= fit.width, label + ': horizontal overflow');
  };
  try {
    for (const width of [1280, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(pathToFileURL(file).href);
      await page.getByRole('heading', { name: 'Event studio' }).waitFor();
      await checkFit('event library ' + width);
      assert.equal(await page.locator('iframe').count(), 0);
      assert.equal(await page.evaluate(() => window.requests.length), 0);
      await page.getByRole('button', { name: 'Edit page', exact: true }).last().click();
      await page.getByRole('form', { name: 'Event page designer' }).waitFor();
      assert.equal(await page.evaluate(() => window.requests.filter(request => request.method === 'GET').length), 1);
      assert.equal(await page.locator('iframe').count(), 0);
      if (width === 1280) {
        const geometry = await page.evaluate(() => ({ sidebar: document.querySelector('[aria-label="Event settings sidebar"]').getBoundingClientRect().right, canvas: document.querySelector('[aria-label="Event canvas"]').getBoundingClientRect().left }));
        assert.ok(geometry.sidebar <= geometry.canvas, 'classic sidebar sits beside the canvas');
      }
      await page.getByRole('button', { name: 'All events', exact: true }).click();
      await page.getByRole('heading', { name: 'Event studio', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Edit page', exact: true }).last().click();
      await page.getByRole('form', { name: 'Event page designer' }).waitFor();
      assert.equal(await page.evaluate(() => window.requests.filter(request => request.method === 'GET').length), 1, 'reopening unchanged content reuses the bounded local cache');
      await page.getByRole('button', { name: 'All events', exact: true }).click();
      await page.evaluate(() => { window.requests = []; });

      await page.getByLabel('Event status').selectOption('Draft');
      assert.equal(await page.locator('article').count(), 1);
      await page.getByLabel('Event status').selectOption('All');
      await page.getByRole('button', { name: /Campus open day/ }).click();
      await page.getByRole('button', { name: 'Basics', exact: true }).click();
      const slugInput = page.locator('input[pattern]');
      await slugInput.fill('');
      await slugInput.pressSequentially('families-open-day');
      assert.equal(await slugInput.inputValue(), 'families-open-day');
      await page.getByRole('button', { name: 'Blocks', exact: true }).click();
      const canvasLayout = await page.locator('[aria-label="Event canvas"]').evaluate((canvas) => {
        const heading = canvas.querySelector('h1').getBoundingClientRect();
        const block = canvas.querySelector('[data-canvas-block]').getBoundingClientRect();
        const paper = canvas.querySelector('[data-canvas-block]').closest('article').parentElement.getBoundingClientRect();
        return { headingBottom: heading.bottom, blockTop: block.top, blockWidth: block.width, paperWidth: paper.width };
      });
      assert.ok(canvasLayout.blockTop > canvasLayout.headingBottom, 'hero sits above editable content');
      if (width === 1280) assert.ok(canvasLayout.blockWidth > canvasLayout.paperWidth * .7, 'canvas content uses the page width');
      await page.getByRole('button', { name: /1\. Heading/ }).click();
      await page.getByLabel('Heading', { exact: true }).fill('Families welcome');
      await page.evaluate(() => { window.rejectNext = true; });
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'Fixture save failed' }).waitFor();
      assert.equal(await page.getByLabel('Heading', { exact: true }).inputValue(), 'Families welcome');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'saved successfully' }).waitFor();
      assert.equal(await page.evaluate(() => window.requests.at(-1).body.blocks[0].text), 'Families welcome');
      assert.equal(await page.evaluate(() => window.requests.at(-1).body.slug), 'families-open-day');
      await page.getByRole('button', { name: 'Duplicate block 1', exact: true }).click();
      assert.equal(await page.locator('button[aria-label^="Remove block"]').count(), 10);
      await page.getByRole('button', { name: 'Undo', exact: true }).click();
      assert.equal(await page.locator('button[aria-label^="Remove block"]').count(), 9);
      await page.getByRole('button', { name: 'Redo', exact: true }).click();
      assert.equal(await page.locator('button[aria-label^="Remove block"]').count(), 10);
      await page.getByRole('button', { name: 'Remove block 2', exact: true }).click();
      assert.equal(await page.locator('button[aria-label^="Remove block"]').count(), 9);
      await page.getByRole('button', { name: /1\. Heading/ }).click();
      await page.getByLabel('Heading', { exact: true }).fill('More to discover');
      await page.getByRole('button', { name: 'All events' }).click();
      await page.getByRole('dialog').waitFor();
      await page.getByRole('button', { name: 'Keep editing' }).click();
      assert.ok(await page.getByRole('form', { name: 'Event page designer' }).evaluate((form) => form.scrollWidth <= form.clientWidth), 'canvas editor fits the viewport');
      if (width === 1280) await page.screenshot({ path: dir + '/event-canvas.png' });
      await page.getByRole('button', { name: 'Preview', exact: true }).click();
      const preview = page.frameLocator('iframe[title="Event page preview"]');
      await preview.getByRole('heading', { name: 'Campus Open Day', exact: true }).waitFor();
      await page.getByRole('button', { name: 'phone preview', exact: true }).click();
      assert.equal(await page.locator('iframe[title="Event page preview"]').evaluate((iframe) => iframe.contentWindow.innerWidth), 390);
      await checkFit('event preview ' + width);
      if (width === 1280) await page.screenshot({ path: dir + '/event-preview.png' });
      await page.getByRole('button', { name: 'All events', exact: true }).click();
      await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
      await page.getByRole('heading', { name: 'Event studio', exact: true }).waitFor();
      assert.equal(await page.getByRole('form', { name: 'Event page designer' }).count(), 0);
      assert.equal(await page.evaluate(() => document.getElementById('root').inert), false);
      assert.equal(await page.evaluate(() => document.body.style.overflow), '', 'closing the editor releases the scroll lock');
      await page.evaluate(() => window.renderEditor());
      await page.getByRole('heading', { name: 'Website design settings' }).waitFor();
      if (width === 1280) await page.screenshot({ path: dir + '/website-design-controls.png' });
      assert.equal(await page.locator('iframe').count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Questions & answers', exact: true }).count(), 0);
      await page.getByLabel('Brand color', { exact: true }).fill('#26556b');
      await page.getByLabel('Typography', { exact: true }).selectOption('serif');
      await page.getByLabel('Hero layout', { exact: true }).selectOption('split');
      await page.getByRole('button', { name: 'Homepage sections', exact: true }).click();
      assert.equal(await page.getByLabel('Typography', { exact: true }).count(), 0);
      await page.getByLabel('About', { exact: true }).uncheck();
      for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Move Contact up', exact: true }).click();
      await page.getByRole('button', { name: 'Custom content', exact: true }).click();
      await page.getByRole('button', { name: 'Questions & answers', exact: true }).click();
      await page.getByLabel('Question 1').fill('Can families visit?');
      await page.getByLabel('Answer', { exact: true }).fill('Book a campus visit with our office.');
      await page.getByRole('button', { name: 'Save public website', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Website saved' }).waitFor();
      const saved = await page.evaluate(() => window.requests.at(-1).body);
      assert.ok(!Object.hasOwn(saved, 'theme'));
      assert.equal(saved.design.sections.find((s) => s.id === 'about').visible, false);
      assert.equal(saved.design.customBlocks[0].items[0].question, 'Can families visit?');
      assert.equal(saved.design.accent, '#26556b'); assert.equal(saved.design.font, 'serif'); assert.equal(saved.design.hero, 'split');
      await page.getByRole('radio', { name: 'Business', exact: true }).check();
      await page.getByRole('button', { name: 'Apply theme', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Theme applied' }).waitFor();
      assert.deepEqual(await page.evaluate(() => window.requests.at(-1).body), { theme: 'heritage' });
      await page.getByRole('button', { name: 'Preview website', exact: true }).click();
      const websiteFrame = page.frameLocator('iframe[title="Institution website preview"]');
      await websiteFrame.getByRole('heading', { name: 'Learn with purpose.' }).waitFor();
      assert.equal(await websiteFrame.locator('#about').count(), 0);
      assert.equal(await websiteFrame.locator('#custom').count(), 1);
      assert.equal(await websiteFrame.locator('#admissions').count(), 1);
      await websiteFrame.getByText('Can families visit?', { exact: true }).click();
      assert.ok(await websiteFrame.getByText('Book a campus visit with our office.').isVisible());
      const order = await page.locator('iframe[title="Institution website preview"]').evaluate((iframe) => Array.from(iframe.contentDocument.querySelector('main').children).map((node) => node.id));
      assert.ok(order.indexOf('contact') < order.indexOf('campus'));
      assert.equal(await page.locator('iframe').count(), 1);
      await checkFit('website designer ' + width);
      if (width === 1280) await page.screenshot({ path: dir + '/website-designer.png' });
      await page.getByRole('button', { name: 'Design & layout', exact: true }).click();
      await page.getByRole('heading', { name: 'Website design settings' }).waitFor();
      assert.equal(await page.locator('iframe').count(), 0, 'closed previews are unmounted');
      await page.getByRole('button', { name: 'Website content', exact: true }).click();
      await page.getByLabel('Homepage headline', { exact: true }).fill('A new community headline');
      await page.getByRole('button', { name: 'Save public website', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Website saved' }).waitFor();
      assert.deepEqual(await page.evaluate(() => window.requests.at(-1).body), { tagline: 'A new community headline' });
      await page.evaluate(() => window.renderStudio({ many: true }));
      await page.getByRole('heading', { name: 'Event studio', exact: true }).waitFor();
      assert.equal(await page.locator('article').count(), 12);
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      assert.equal(await page.locator('article').count(), 12);
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      assert.equal(await page.locator('article').count(), 3);
      await page.getByLabel('Search events', { exact: true }).fill('Fixture event 25');
      assert.equal(await page.locator('article').count(), 1);
      await checkFit('paged event library ' + width);
      await page.evaluate(() => window.renderStudio({ readOnly: true }));
      await page.getByRole('heading', { name: 'Event studio', exact: true }).waitFor();
      assert.ok(await page.getByRole('button', { name: 'Blank event', exact: true }).isDisabled());
      await page.getByRole('button', { name: 'Edit page', exact: true }).first().click();
      await page.getByRole('form', { name: 'Event page designer' }).waitFor();
      assert.ok(await page.getByLabel('Event title', { exact: true }).isDisabled());
      assert.ok(await page.getByRole('button', { name: 'Save', exact: true }).isDisabled());
      await page.evaluate(() => { window.renderStudio(); window.requests = []; });
      evidence.push({ width, eventDraftRetry: true, latestInputSaved: true, duplicateRemove: true, undoRedo: true, unsavedGuard: true, realPhonePreview: true, classicCanvas: true, lazyOwnedContent: true, boundedLibrary: true, previewUnmounts: true, visibleDesignSettings: true, readOnlyPortal: true, websiteSections: true, faq: true, separateThemeSave: true, noOverflow: true });
    }
    let staticCases = 0;
    for (const theme of ['default', 'heritage', 'folio', 'grove', 'orbit', 'mosaic']) {
      for (const hero of [undefined, 'split', 'banner', 'minimal']) {
        for (const width of [1280, 390, 320]) {
          await page.setViewportSize({ width, height: 900 });
          await page.evaluate(({ theme, hero }) => window.renderSite(theme, { hero, sections: [{ id: 'contact', visible: true, title: 'Visit our campus' }, { id: 'about', visible: false, title: '' }] }), { theme, hero });
          await page.getByRole('heading', { name: 'Learn with purpose.' }).waitFor();
          await checkFit('homepage ' + theme + '/' + hero + '/' + width);
          assert.equal(await page.locator('#about').count(), 0);
          assert.equal(await page.locator('main').last().locator(':scope > section').nth(1).getAttribute('id'), 'contact');
          if (hero === 'minimal') assert.equal(await page.locator('#welcome img').isVisible(), false);
          staticCases++;
        }
      }
    }
    for (const hero of ['split', 'banner', 'minimal']) {
      for (const width of [1280, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate((hero) => window.renderEvent(hero), hero);
        await page.getByRole('heading', { name: 'Live open day', exact: true }).waitFor();
        await checkFit('event public layout ' + hero + '/' + width);
        assert.equal(await page.locator('figure img').count(), 3);
        const verticalLayout = await page.evaluate(() => ({ heading: document.querySelector('h1').getBoundingClientRect().bottom, content: document.querySelector('article').getBoundingClientRect().top }));
        assert.ok(verticalLayout.content >= verticalLayout.heading, 'public event content follows the hero for ' + hero);
        staticCases++;
      }
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(dir + '/ui-results.json', JSON.stringify({ editorCases: evidence, staticCases, browserErrors: errors, source: 'Actual React components, Next image/link stubs, compiled global CSS, offline synthetic media and intercepted API replies.' }, null, 2));
    console.log('PASS: editor save/retry, current text, blocks, discard guard, phone preview, section ordering/visibility, FAQ and separate theme save at 1280/390/320px; ' + staticCases + ' public layout cases.');
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

