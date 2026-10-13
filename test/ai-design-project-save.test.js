const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../public/js/model-designer.js'),'utf8');
const start = source.indexOf('    async saveAiDesignProject() {');
const end = source.indexOf('    async ensureSavedProjectForShare()',start);
function setup({projectId='',fail=false,authenticated=true}={}) {
  const state = {projectId};
  const saves = [];
  const error = Object.assign(Error('Storage limit reached'),{status:403});
  const context = { state,modelDesignerConfig:{userAuthenticated:authenticated},cloudProjectLoadPromise:Promise.resolve(),URLSearchParams,window:{location:{search:''},UserProjects:{}},saveCloudProject:async options=>{saves.push(options);if(fail)throw error;state.projectId ||= 'new-project';return true;} };
  vm.runInNewContext('this.api={\n'+source.slice(start,end)+'\n};',context);
  return {context,state,saves,error};
}
test('AI application saves a new project, then saves further designs into that same project',async()=>{
  const h=setup();
  assert.equal(await h.context.api.saveAiDesignProject(),'new-project');
  assert.equal(await h.context.api.saveAiDesignProject(),'new-project');
  assert.equal(h.saves.length,2);
  assert.equal(h.saves[0].closeAfterSave,false);
  assert.equal(h.saves[0].throwOnError,true);
});
test('an existing project is updated rather than skipped',async()=>{
  const h=setup({projectId:'existing-project'});
  assert.equal(await h.context.api.saveAiDesignProject(),'existing-project');
  assert.equal(h.saves.length,1);
});
test('save failure reaches the conversation without initiating another generation',async()=>{
  const h=setup({fail:true});
  await assert.rejects(h.context.api.saveAiDesignProject(),e=>e===h.error);
  assert.equal(h.state.projectId,'');
});
test('anonymous users cannot create an AI project',async()=>{
  const h=setup({authenticated:false});
  await assert.rejects(h.context.api.saveAiDesignProject(),/Sign in/);
  assert.equal(h.saves.length,0);
});
