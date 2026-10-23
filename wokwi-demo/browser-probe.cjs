const { chromium } = require('../tools/node_modules/playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const baseUrl = process.env.IOT58_API_URL || 'http://localhost:1880';
const offlineTest=process.argv.includes('--offline');
const sourceText=fs.readFileSync('wokwi-demo/sketch.ino','utf8');
const injectedSource=offlineTest?sourceText.replace('ENABLE_SERIAL_DIAGNOSTICS = false','ENABLE_SERIAL_DIAGNOSTICS = true'):sourceText;
let currentPage, currentBrowser;
async function api(path,body) {
  const response=await fetch(baseUrl+'/api/iot58/'+path,body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const value=await response.json();
  if(!response.ok)throw Error(`${path}: HTTP${response.status} ${JSON.stringify(value)}`);
  return value;
}
async function until(check,label) {
  const deadline=Date.now()+25000;
  while(Date.now()<deadline) {
    const state=await api('state'); const result=check(state);
    if(result)return result;
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  throw Error('Timed out: '+label);
}
(async () => {
  const browser = await chromium.launch({ executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true });
  currentBrowser=browser;
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  currentPage=page;
  page.on('console', msg => { if (msg.type()==='error') console.log('CONSOLE',msg.text().slice(0,200)); });
  await page.goto('https://wokwi.com/projects/new/esp32',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(5000);
  await page.getByRole('button',{name:'diagram.json',exact:true}).click();
  await page.waitForTimeout(300);
  await page.evaluate(({sketch,diagram})=>{
    for(const m of window.monaco.editor.getModels()) {
      if(m.uri.toString()==='vfs:sketch.ino') m.setValue(sketch);
      if(m.uri.toString()==='vfs:diagram.json') m.setValue(diagram);
    }
  },{sketch:injectedSource,diagram:fs.readFileSync('wokwi-demo/diagram.json','utf8')});
  await page.locator('button').nth(8).click();
  await page.getByText('New file...', {exact:true}).click();
  await page.waitForTimeout(300);
  await page.locator('input').fill('libraries.txt');
  await page.getByRole('button',{name:'Create',exact:true}).click();
  await page.waitForTimeout(500);
  await page.evaluate(libraries=>window.monaco.editor.getModels().find(m=>m.uri.toString()==='vfs:libraries.txt').setValue(libraries),fs.readFileSync('wokwi-demo/libraries.txt','utf8'));
  await page.locator('button').nth(9).click();
  await page.getByText('New file...', {exact:true}).click();
  await page.locator('input').fill('partitions.csv');
  await page.getByRole('button',{name:'Create',exact:true}).click();
  await page.waitForTimeout(500);
  await page.evaluate(partitions=>window.monaco.editor.getModels().find(m=>m.uri.toString()==='vfs:partitions.csv').setValue(partitions),fs.readFileSync('wokwi-demo/partitions.csv','utf8'));
  await page.getByRole('button',{name:'Start the simulation',exact:true}).click();
  for(let i=0;i<36;i++) {
    await page.waitForTimeout(5000);
    const text=await page.locator('body').innerText();
    console.log('SIM',i,text.slice(-1300));
    if((process.argv.includes('--e2e')||offlineTest)&&text.includes('MQTT_ONLINE'))break;
    if(i===18) {
      const button=page.getByRole('button',{name:'A01 / iPhone green pushbutton',exact:true});
      const box=await button.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
      await page.mouse.down();await page.waitForTimeout(150);await page.mouse.up();
    }
  }
  if(offlineTest) {
    await api('demo/reset',{});
    for(const id of ['NV01','NV02','NV03'])await api('staff/'+id+'/status',{status:'BUSY'});
    await page.waitForTimeout(10000);
    const serial=page.locator('input').last();
    await serial.fill('O');await serial.press('Enter');
    const deadline=Date.now()+10000;
    while(!(await page.locator('body').innerText()).includes('DIAG_OFFLINE')&&Date.now()<deadline)await page.waitForTimeout(200);
    assert.ok((await page.locator('body').innerText()).includes('DIAG_OFFLINE'));
    for(const device of ['A01','B01']) {
      const box=await page.getByRole('button',{name:new RegExp(`^${device} / .* pushbutton$`)}).boundingBox();
      await page.mouse.move(box.x+box.width/2,box.y+box.height*0.3);
      await page.mouse.down();await page.waitForTimeout(650);await page.mouse.up();
      await page.waitForTimeout(1000);
    }
    assert.equal((await api('state')).tickets.length,0);
    const serialBefore=await page.locator('body').innerText();
    const queuedIds=[...serialBefore.matchAll(/QUEUED ([AB]01) REQUEST \(([^)]+)\)/g)].map(m=>({device_id:m[1],msg_id:m[2]}));
    assert.equal(queuedIds.length,2);
    await page.screenshot({path:'wokwi-demo/.build-tools/offline-buffer.png',fullPage:true});
    await serial.fill('R');await serial.press('Enter');
    await until(s=>s.tickets.filter(t=>queuedIds.some(q=>q.msg_id===t.origin_msg_id)).length===2,'offline persisted reboot replay');
    const after=await page.locator('body').innerText();
    assert.ok(/LITTLEFS restored [1-9]\d* events/.test(after));
    const state=await api('state');
    assert.equal(state.tickets.length,2);
    assert.equal(state.tickets[0].origin_msg_id,queuedIds[0].msg_id);
    assert.equal(state.tickets[1].origin_msg_id,queuedIds[1].msg_id);
    fs.writeFileSync('wokwi-demo/.build-tools/browser-offline-results.json',JSON.stringify({at:new Date().toISOString(),broker:'broker.hivemq.com:1883',base_topic:'huit/iot58/n20-smart-support/store/s1',test_overlay:'Only ENABLE_SERIAL_DIAGNOSTICS true; delivery default false',source_sha256:crypto.createHash('sha256').update(sourceText).digest('hex'),queuedIds,serial_before:serialBefore,serial_after:after,state},null,2));
    await page.screenshot({path:'wokwi-demo/.build-tools/offline-reboot-replay.png',fullPage:true});
    console.log('OFFLINE PASS',JSON.stringify(queuedIds));
  }
  if(process.argv.includes('--e2e')) {
    const proofs=[];
    const press=async(device,duration=650)=>{
      const button=page.getByRole('button',{name:new RegExp(`^${device} / .* pushbutton$`)});
      const box=await button.boundingBox();
      console.log('PHYSICAL_PRESS',device,box);
      // Part accessibility box includes its label. Activate the circular switch
      // in the upper portion, not the label below the component.
      await page.mouse.move(box.x+box.width/2,box.y+box.height*0.3);
      await page.mouse.down();await page.waitForTimeout(duration);await page.mouse.up();
    };
    await api('demo/reset',{});
    for(const id of ['NV01','NV02','NV03'])await api('staff/'+id+'/status',{status:'BUSY'});
    // Let retained/reset/sync commands settle before the first physical press.
    await page.waitForTimeout(12000);
    await press('A01');
    let a;
    try {a=await until(s=>s.tickets.find(t=>t.device_id==='A01'&&t.intent==='CONSULTATION'),'A short request');}
    catch(error) {
      console.log('FAILED SERIAL', (await page.locator('body').innerText()).slice(-11000));
      await page.screenshot({path:'wokwi-demo/.build-tools/e2e-failed.png',fullPage:true});
      await browser.close();throw error;
    }
    proofs.push({check:'A short consultation uplink',ticket_id:a.ticket_id});
    await press('B01',4500);
    let b;
    try {b=await until(s=>s.tickets.find(t=>t.device_id==='B01'&&t.intent==='PAYMENT'),'B long payment');}
    catch(error) {
      console.log('FAILED B SERIAL', (await page.locator('body').innerText()).slice(-16000));
      await page.screenshot({path:'wokwi-demo/.build-tools/e2e-failed-b.png',fullPage:true});
      await browser.close();throw error;
    }
    const queue=await api('queue');const rows=Array.isArray(queue)?queue:queue.queue;
    assert.equal(rows[0].device_id,'B01');assert.ok(rows.length>=2);
    proofs.push({check:'global two-ticket queue B outranks A',rows:rows.map(t=>({device:t.device_id,priority:t.priority}))});
    await page.screenshot({path:'wokwi-demo/.build-tools/e2e-queue.png',fullPage:true});
    await api('staff/NV02/status',{status:'AVAILABLE'});
    await until(s=>s.tickets.find(t=>t.ticket_id===b.ticket_id&&t.assigned_staff_id==='NV02'),'B dispatch NV02');
    const oldAckCount=((await page.locator('body').innerText()).match(/CMD_APPLIED B01 ACK /g)||[]).length;
    await api('tickets/'+b.ticket_id+'/ack',{staff_id:'NV02'});
    const ackDeadline=Date.now()+20000;
    while(((await page.locator('body').innerText()).match(/CMD_APPLIED B01 ACK /g)||[]).length<=oldAckCount&&Date.now()<ackDeadline)await page.waitForTimeout(400);
    assert.ok(((await page.locator('body').innerText()).match(/CMD_APPLIED B01 ACK /g)||[]).length>oldAckCount);
    await page.waitForTimeout(250);
    await page.screenshot({path:'wokwi-demo/.build-tools/e2e-ack-blue.png',fullPage:true});
    const protectedDone=await fetch(baseUrl+'/api/iot58/tickets/'+b.ticket_id+'/done',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
    assert.equal(protectedDone.status,409);
    proofs.push({check:'ACK downlink applied; DONE before ARRIVED HTTP409'});
    await press('B01');
    const arrived=await until(s=>s.tickets.find(t=>t.ticket_id===b.ticket_id&&t.state==='ARRIVED'),'physical arrived');
    assert.ok(arrived.response_time_ms>=arrived.ack_latency_ms);
    proofs.push({check:'physical ARRIVED; response created→arrived',response_time_ms:arrived.response_time_ms,ack_latency_ms:arrived.ack_latency_ms});
    const oldRateCount=((await page.locator('body').innerText()).match(/CMD_APPLIED B01 RATE /g)||[]).length;
    await api('tickets/'+b.ticket_id+'/done',{});
    const csatDeadline=Date.now()+10000;
    while(((await page.locator('body').innerText()).match(/CMD_APPLIED B01 RATE /g)||[]).length<=oldRateCount&&Date.now()<csatDeadline)await page.waitForTimeout(250);
    assert.ok(((await page.locator('body').innerText()).match(/CMD_APPLIED B01 RATE /g)||[]).length>oldRateCount);
    await page.screenshot({path:'wokwi-demo/.build-tools/e2e-resolved-csat.png',fullPage:true});
    await press('B01');
    await until(s=>s.tickets.find(t=>t.ticket_id===b.ticket_id&&t.csat==='SATISFIED'),'physical CSAT');
    proofs.push({check:'DONE RESOLVED, EWMA and physical satisfied CSAT'});
    await press('C01');
    const c=await until(s=>s.tickets.find(t=>t.device_id==='C01'&&['PENDING','ESCALATED_L1','ESCALATED_L2'].includes(t.state)),'C pending');
    // Wait for the physical point to receive PENDING before cancelling. Resolve
    // the switch position once so locator round-trips cannot stretch the gap.
    const cancelDeadline=Date.now()+15000;
    while(!(await page.locator('body').innerText()).includes('CMD_APPLIED C01 PEND ')&&Date.now()<cancelDeadline)await page.waitForTimeout(200);
    assert.ok((await page.locator('body').innerText()).includes('CMD_APPLIED C01 PEND '));
    const cancelBox=await page.getByRole('button',{name:/^C01 \/ .* pushbutton$/}).boundingBox();
    await page.mouse.move(cancelBox.x+cancelBox.width/2,cancelBox.y+cancelBox.height*0.3);
    await page.mouse.down();await page.waitForTimeout(250);await page.mouse.up();
    await page.waitForTimeout(100);
    await page.mouse.down();await page.waitForTimeout(250);await page.mouse.up();
    await until(s=>s.tickets.find(t=>t.ticket_id===c.ticket_id&&t.state==='CANCELLED'),'C double cancel');
    proofs.push({check:'C double cancel physical'});
    for(let i=0;i<6;i++){await press('A01',550);await page.waitForTimeout(900);}
    await until(s=>s.devices.A01?.state==='SPAM_LOCK'||s.alerts.some(a=>a.type==='SPAM_DETECTED'),'A spam lock');
    proofs.push({check:'A physical spam lock'});
    fs.writeFileSync('wokwi-demo/.build-tools/browser-e2e-results.json',JSON.stringify({at:new Date().toISOString(),broker:'broker.hivemq.com:1883',base_topic:'huit/iot58/n20-smart-support/store/s1',test_overlay:offlineTest?'Only ENABLE_SERIAL_DIAGNOSTICS true; delivery default false':'None; delivered source',delivery_source_sha256:crypto.createHash('sha256').update(sourceText).digest('hex'),tested_source_sha256:crypto.createHash('sha256').update(injectedSource).digest('hex'),proofs,serial:await page.locator('body').innerText(),state:await api('state')},null,2));
    console.log('E2E PASS',JSON.stringify(proofs));
    await page.screenshot({path:'wokwi-demo/.build-tools/e2e-final.png',fullPage:true});
    console.log('NETWORK_ICON',await page.evaluate(()=>{
      const el=document.elementFromPoint(892,108);
      return el?.closest('button')?.outerHTML || el?.parentElement?.parentElement?.outerHTML;
    }));
    await page.mouse.click(892,108);
    await page.waitForTimeout(500);
    console.log('NETWORK_MENU',(await page.locator('body').innerText()).slice(-3500));
  }
  console.log('URL',page.url());
  console.log('MODELS',await page.evaluate(()=>({monaco:typeof window.monaco,models:window.monaco?.editor?.getModels?.().map(m=>({uri:m.uri.toString(),size:m.getValue().length}))})));
  await page.screenshot({path:'wokwi-demo/.build-tools/browser-run.png',fullPage:true});
  await browser.close();
})().catch(async error=>{
  console.error(error);
  if(currentPage&&!currentPage.isClosed()){
    console.log('FINAL_FAILURE_SERIAL',(await currentPage.locator('body').innerText()).slice(-20000));
    await currentPage.screenshot({path:'wokwi-demo/.build-tools/e2e-latest-failure.png',fullPage:true});
  }
  if(currentBrowser)await currentBrowser.close();
  process.exit(1);
});
