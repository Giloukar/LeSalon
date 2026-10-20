import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=fileURLToPath(new URL('../../',import.meta.url));

async function openLexiMind(){
 const browser=await chromium.launch({headless:true,executablePath:process.env.TABLE_BROWSER_EXECUTABLE});
 const page=await browser.newPage();
 await page.addInitScript(()=>{
  const words=[
   {id:1,word:'Mot alpha',definition:'Définition alpha',pos:'nom'},
   {id:2,word:'Mot bêta',definition:'Définition bêta',pos:'nom'},
   {id:3,word:'Mot gamma',definition:'Définition gamma',pos:'nom'}
  ];
  let quizCalls=0;
  window.__lexiTest={get quizCalls(){return quizCalls},words};
  window.SalonAccount={db:()=>null,user:()=>null,onChange(){},init:async()=>{}};
  window.LexiAdaptive={next:()=>({due_at:new Date(Date.now()+86400000).toISOString(),level:1,reviews:1})};
  window.LexiFeed={
   quiz:async()=>{quizCalls++;return [words[(quizCalls-1)%words.length]]},
   next:async()=>null,refill:async()=>[],reset(){}
  };
  window.LexiExercises={mcq:async item=>({target:item,options:[
   {...item,is_answer:true},
   {definition:'Mauvaise définition 1',is_answer:false},
   {definition:'Mauvaise définition 2',is_answer:false},
   {definition:'Mauvaise définition 3',is_answer:false}
  ]})};
  window.LexiOffline={show(){},hide(){}};
 });
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='lexi.test'&&url.pathname==='/leximind.html'){
   return route.fulfill({status:200,contentType:'text/html',body:await readFile(path.join(root,'leximind.html'))});
  }
  return route.fulfill({status:200,contentType:'text/javascript',body:''});
 });
 await page.goto('http://lexi.test/leximind.html');
 return{browser,page};
}

test('quiz validates one answer and automatically displays the next question',async()=>{
 const {browser,page}=await openLexiMind();
 try{
  await page.click('[data-p="quiz"]');
  await page.waitForFunction(()=>document.querySelector('#qword')?.textContent==='Mot alpha');
  await page.click('#answers .ans:first-child');
  assert.equal(await page.locator('#quizFeedback').textContent(),'✓ Bonne réponse. Question suivante…');
  assert.equal(await page.evaluate(()=>S.answers),1);
  assert.equal(await page.evaluate(()=>S.correct),1);
  assert.equal(await page.locator('#qnext').isVisible(),true);
  await page.waitForFunction(()=>document.querySelector('#qword')?.textContent==='Mot bêta');
  assert.equal(await page.evaluate(()=>S.answers),1,'the auto-advance must not submit another answer');
  assert.equal(await page.locator('#quizFeedback').isVisible(),false);
  assert.equal(await page.evaluate(()=>__lexiTest.quizCalls),2);
 }finally{await browser.close()}
});

test('wrong answers still advance and a manual next cancels the delayed automatic next',async()=>{
 const {browser,page}=await openLexiMind();
 try{
  await page.click('[data-p="quiz"]');
  await page.waitForFunction(()=>document.querySelector('#qword')?.textContent==='Mot alpha');
  await page.click('#answers .ans:nth-child(2)');
  assert.equal(await page.locator('#answers .ans:first-child').getAttribute('class'),'ans ok');
  assert.equal(await page.evaluate(()=>S.answers),1);
  await page.click('#qnext');
  await page.waitForFunction(()=>document.querySelector('#qword')?.textContent==='Mot bêta');
  await page.waitForTimeout(950);
  assert.equal(await page.evaluate(()=>__lexiTest.quizCalls),2,'obsolete timer must not skip the next question');
 }finally{await browser.close()}
});

test('leaving Quiz cancels its automatic advance and pending answer requests',async()=>{
 const {browser,page}=await openLexiMind();
 try{
  await page.click('[data-p="quiz"]');
  await page.waitForFunction(()=>document.querySelector('#qword')?.textContent==='Mot alpha');
  await page.click('#answers .ans:first-child');
  await page.click('[data-p="free"]');
  await page.waitForTimeout(950);
  assert.equal(await page.evaluate(()=>__lexiTest.quizCalls),2,'only the Réponse libre screen should make another question-pack request');
  assert.equal(await page.locator('#quiz').isVisible(),false);
  assert.equal(await page.locator('#free').isVisible(),true);
  await page.evaluate(()=>{
   LexiExercises.mcq=()=>new Promise(resolve=>{window.__lexiTest.resolveAnswer=resolve});
  });
  await page.click('[data-p="quiz"]');
  await page.waitForFunction(()=>typeof __lexiTest.resolveAnswer==='function');
  await page.click('[data-p="free"]');
  await page.evaluate(()=>__lexiTest.resolveAnswer({target:__lexiTest.words[1],options:[]}));
  await page.waitForTimeout(50);
  assert.equal(await page.locator('#quiz').isVisible(),false);
  assert.equal(await page.locator('#answers .ans').count(),0,'late response must not recreate quiz buttons');
 }finally{await browser.close()}
});
