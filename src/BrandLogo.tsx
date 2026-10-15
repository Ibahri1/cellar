// CSS custom-property URLs resolve at their stylesheet, unlike <img> URLs.
// Resolve once against the document so both uses share the same public asset.
export const bahriArtwork=new URL(`${import.meta.env.BASE_URL}bahri-logo.png`,document.baseURI).href;

/** The supplied artwork is always shown in full, at its original proportions. */
export default function BrandLogo({className=''}:{className?:string}){
 return <img className={`brand-logo ${className}`} src={bahriArtwork} alt="BAHRI" width={1774} height={887} decoding="async"/>;
}

export function BrandedLoading(){return <div className="loading branded-loading" role="status"><BrandLogo/><p>Opening your cellar…</p></div>;}
