// Poll long-running jobs without creating another job or presenting partial rows
// as a completed verification. Resume by reading progress after page reload.
(() => {
  async function track({api,onUpdate,sleep=ms=>new Promise(r=>setTimeout(r,ms)),now=Date.now,start=true,signal}) {
    const began=now();let result=await api(start?'verification-start':'verification-progress',start?{}:undefined);
    for(;;){
      signal?.throwIfAborted();
      onUpdate({...result,background:result.running && now()-began>=35000});
      if(!result.running)return result;
      await sleep(now()-began>=35000?5000:500);
      signal?.throwIfAborted();
      try{result=await api('verification-progress');}
      catch(error){onUpdate({...result,running:true,background:true,connectionError:error.message});await sleep(5000);}
    }
  }
  globalThis.DucoroVerificationTracker={track};
})();
