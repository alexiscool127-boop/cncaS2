// Extract searchable text from PDFs using the bundled Mozilla PDF.js build.
// This intentionally does not pretend to OCR image-only/scanned pages.
async function extractPdfRecords(title,bytes,progress=()=>{}){
  if(typeof browser?.runtime?.getURL!=="function")throw Error("PDF reader is unavailable.");
  const pdfjs=await import(browser.runtime.getURL("pdf.mjs"));
  pdfjs.GlobalWorkerOptions.workerSrc=browser.runtime.getURL("pdf.worker.mjs");
  let document;
  try{
    document=await pdfjs.getDocument({data:new Uint8Array(bytes),disableFontFace:true}).promise;
    if(document.numPages>300)throw Error("PDF has too many pages for a single import.");
    const records=[];
    for(let i=1;i<=document.numPages;i++){
      const page=await document.getPage(i);
      const text=await page.getTextContent();
      const words=text.items.map(item=>typeof item.str==="string"?item.str:"").filter(Boolean);
      records.push(...noteChunkRecords(title,"page "+i,words.join(" ")));
      page.cleanup();
      progress(i/document.numPages);
    }
    return records;
  }catch(error){
    if(error?.name==="PasswordException")throw Error("Password-protected PDFs must be unlocked before importing.");
    throw error;
  }finally{await document?.destroy().catch(()=>{});}
}
