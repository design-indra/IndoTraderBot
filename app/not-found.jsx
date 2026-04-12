export default function NotFound() {
  return (
    <html lang="id">
      <body>
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:'100vh',fontFamily:'sans-serif',background:'#f3f4f6'}}>
          <h1 style={{fontSize:'4rem',fontWeight:'bold',color:'#0ea5e9',margin:0}}>404</h1>
          <p style={{color:'#6b7280',marginTop:'8px'}}>Halaman tidak ditemukan</p>
          <a href="/" style={{marginTop:'16px',color:'#0ea5e9',textDecoration:'none',fontWeight:'600'}}>← Kembali</a>
        </div>
      </body>
    </html>
  );
}
