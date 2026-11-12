// All reads and writes share one revision queue, including initialization.
(() => {
  function create({api,onStatus=()=>{}}){
    let revision=null,initialError;
    let tail=api('draft').then(value=>{revision=value.revision??null;}).catch(error=>{initialError=error;onStatus('error',error);});
    const queue=work=>{tail=tail.catch(()=>{}).then(work);return tail;};
    const write=async value=>{
      if(initialError)throw initialError;onStatus('saving');
      let saved;
      for(let attempt=0;;attempt++) {
        try {saved=await api('draft',{...value,revision});break;}
        catch(error){if(error.code!=='DRAFT_BUSY'&&error.errorCode!=='DRAFT_BUSY'||attempt>=3)throw error;await new Promise(r=>setTimeout(r,100*(attempt+1)));}
      }
      if(saved.conflict)throw Error('Draft changed in another page; restore or reload before editing.');
      revision=saved.revision??null;onStatus('saved');return saved;
    };
    return {
      write(value){return queue(()=>write(value));},
      read(){return queue(async()=>{const saved=await api('draft');revision=saved.revision??null;initialError=null;return saved;});},
      clear(){return queue(()=>write({clear:true}));},
    };
  }
  globalThis.DucoroDrafts={create};
})();
