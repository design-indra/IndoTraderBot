'use client';
export default function Error({ reset }) {
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:'100vh',fontFamily:'sans-serif',background:'#f3f4f6'}}>
      <h1 style={{fontSize:'4rem',fontWeight:'bold',color:'#ef4444',margin:0}}>500</h1>
      <p style={{color:'#6b7280',marginTop:'8px'}}>Terjadi kesalahan</p>
      <button onClick={reset} style={{marginTop:'16px',color:'#0ea5e9',background:'none',border:'none',cursor:'pointer',fontWeight:'600'}}>Coba lagi</button>
    </div>
  );
}
