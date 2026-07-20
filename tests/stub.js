// Headless DOM stub for running the app's <script> under Node. Concatenate: stub.js + app.js + test.
function el(){ const t={classList:{add(){},remove(){},toggle(){},contains(){return false}},style:{},dataset:{},innerHTML:'',textContent:'',value:'',onclick:null,
  appendChild(){},insertBefore(){},remove(){},focus(){},select(){},scrollIntoView(){},getBoundingClientRect(){return{left:0,top:0,width:100}},getContext(){return null}};
  return new Proxy(t,{get(o,p){ if(p==='parentNode') return el(); return o[p]; },set(o,p,v){o[p]=v;return true;}});
}
const document={addEventListener(){},getElementById:()=>el(),querySelector:()=>el(),querySelectorAll:()=>[],createElement:()=>el(),
  body:{appendChild(){},removeChild(){},classList:{add(){},remove(){},toggle(){},contains(){return false}}}};
const window={addEventListener(){},navigator:{},scrollTo(){},innerWidth:800,innerHeight:600,__SAVED_DATA:null,webkit:null};
const localStorage={getItem:()=>null,setItem(){}};
const navigator={userAgent:'test',platform:'test',maxTouchPoints:0};
const fetch=()=>Promise.resolve({json:()=>Promise.resolve({count:0})});
const requestAnimationFrame=()=>{};
const matchMedia=()=>({matches:false});
const location={protocol:'file:'};
