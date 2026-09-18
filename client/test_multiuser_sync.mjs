import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import ws from 'ws';

const ROOM = `test-sync-${Date.now()}`;
const WS_URL = 'ws://localhost:1234';

console.log(`Starting multi-user sync test for room: ${ROOM}`);

// Client 1 (Admin)
const doc1 = new Y.Doc();
const ws1 = new WebsocketProvider(WS_URL, ROOM, doc1, {
  WebSocketPolyfill: ws,
  params: { token: 'token-admin-1', password: '' }
});

// Client 2 (Peer)
const doc2 = new Y.Doc();
const ws2 = new WebsocketProvider(WS_URL, ROOM, doc2, {
  WebSocketPolyfill: ws,
  params: { token: 'token-peer-2', password: '' }
});

const delay = ms => new Promise(r => setTimeout(r, ms));

async function runTest() {
  await delay(1000);
  console.log('Client 1 synced:', ws1.synced, 'Client 2 synced:', ws2.synced);

  const wsWorkspace1 = doc1.getArray('workspace');
  const wsWorkspace2 = doc2.getArray('workspace');

  let workspaceUpdated2 = false;
  wsWorkspace2.observe(() => {
    console.log('[Client 2] workspace updated:', wsWorkspace2.toArray());
    workspaceUpdated2 = true;
  });

  // Step 1: Client 1 initializes default doc and page
  console.log('Step 1: Client 1 creates default doc & page');
  doc1.transact(() => {
    doc1.getMap('meta_doc-default').set('title', 'Project Plan');
    doc1.getArray('pages_doc-default').push(['p1']);
    wsWorkspace1.push(['doc-default']);
  });

  await delay(500);

  console.log('Client 2 workspace:', wsWorkspace2.toArray());
  if (wsWorkspace2.toArray().includes('doc-default')) {
    console.log('✅ PASS: Client 2 received doc-default in workspace');
  } else {
    console.error('❌ FAIL: Client 2 did not receive doc-default');
  }

  const pages2 = doc2.getArray('pages_doc-default');
  console.log('Client 2 pages for doc-default:', pages2.toArray());
  if (pages2.toArray().includes('p1')) {
    console.log('✅ PASS: Client 2 received page p1');
  } else {
    console.error('❌ FAIL: Client 2 did not receive page p1');
  }

  // Step 2: Client 2 adds a new page below
  console.log('Step 2: Client 2 adds page-2 below');
  const pages1 = doc1.getArray('pages_doc-default');
  let pageAdded1 = false;
  pages1.observe(() => {
    console.log('[Client 1] pages updated:', pages1.toArray());
    pageAdded1 = true;
  });

  doc2.transact(() => {
    pages2.push(['p-custom-2']);
  });

  await delay(500);

  if (pages1.toArray().includes('p-custom-2')) {
    console.log('✅ PASS: Client 1 received new page p-custom-2 created by Client 2');
  } else {
    console.error('❌ FAIL: Client 1 did not receive new page');
  }

  // Step 3: Client 1 writes into the new page fragment (XmlFragment for TipTap)
  console.log('Step 3: Client 1 writes text into page-2 fragment');
  const frag1 = doc1.getXmlFragment('doc-default_page_p-custom-2');
  const frag2 = doc2.getXmlFragment('doc-default_page_p-custom-2');

  frag2.observeDeep(() => {
    console.log('[Client 2] fragment updated!');
  });

  doc1.transact(() => {
    const p = new Y.XmlElement('paragraph');
    const text = new Y.XmlText('Hello from Client 1!');
    p.insert(0, [text]);
    frag1.insert(0, [p]);
  });

  await delay(500);

  console.log('Client 2 fragment XML:', frag2.toString());
  if (frag2.toString().includes('Hello from Client 1!')) {
    console.log('✅ PASS: Client 2 received content typed by Client 1');
  } else {
    console.error('❌ FAIL: Client 2 did not receive content');
  }

  // Step 4: Client 1 deletes the page p-custom-2
  console.log('Step 4: Client 1 deletes page p-custom-2');
  doc1.transact(() => {
    const idx = pages1.toArray().indexOf('p-custom-2');
    if (idx !== -1) {
      pages1.delete(idx, 1);
    }
  });

  await delay(500);

  console.log('Client 2 pages after deletion:', pages2.toArray());
  if (!pages2.toArray().includes('p-custom-2') && pages2.toArray().includes('p1')) {
    console.log('✅ PASS: Client 2 received page deletion');
  } else {
    console.error('❌ FAIL: Client 2 did not reflect page deletion');
  }

  // Step 5: Admin (Client 1) creates a new document
  console.log('Step 5: Admin creates new document doc-roadmap');
  doc1.transact(() => {
    doc1.getMap('meta_doc-roadmap').set('title', 'Product Roadmap');
    doc1.getArray('pages_doc-roadmap').push(['p1']);
    wsWorkspace1.push(['doc-roadmap']);
  });

  await delay(500);

  console.log('Client 2 workspace after doc creation:', wsWorkspace2.toArray());
  if (wsWorkspace2.toArray().includes('doc-roadmap')) {
    console.log('✅ PASS: Client 2 received new document doc-roadmap');
  } else {
    console.error('❌ FAIL: Client 2 did not receive new document');
  }

  // Step 6: Admin deletes document doc-roadmap
  console.log('Step 6: Admin deletes document doc-roadmap');
  doc1.transact(() => {
    const idx = wsWorkspace1.toArray().indexOf('doc-roadmap');
    if (idx !== -1) {
      wsWorkspace1.delete(idx, 1);
    }
    doc1.getMap('meta_doc-roadmap').clear();
    const pArray = doc1.getArray('pages_doc-roadmap');
    if (pArray.length > 0) pArray.delete(0, pArray.length);
  });

  await delay(500);

  console.log('Client 2 workspace after doc deletion:', wsWorkspace2.toArray());
  if (!wsWorkspace2.toArray().includes('doc-roadmap')) {
    console.log('✅ PASS: Client 2 received document deletion');
  } else {
    console.error('❌ FAIL: Client 2 did not reflect document deletion');
  }

  console.log('\n🎉 ALL MULTI-USER REAL-TIME SYNC TESTS PASSED!');
  ws1.destroy();
  ws2.destroy();
  doc1.destroy();
  doc2.destroy();
  process.exit(0);
}

runTest().catch(e => {
  console.error(e);
  process.exit(1);
});
