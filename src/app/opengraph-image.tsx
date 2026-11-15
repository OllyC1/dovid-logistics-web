import { ImageResponse } from "next/og";
export const alt="Dovid Logistics — Delivering Trust. Moving Forward.";
export const size={width:1200,height:630};
export const contentType="image/png";
export default function OpenGraphImage(){return new ImageResponse(<div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",justifyContent:"center",padding:"80px",background:"#0B1F44",color:"white"}}><div style={{fontSize:26,textTransform:"uppercase",letterSpacing:5,color:"#FF6A00",fontWeight:800}}>Dovid Logistics</div><div style={{display:"flex",flexDirection:"column",fontSize:76,lineHeight:1.05,fontWeight:800,maxWidth:900,marginTop:26}}><span>Delivering Trust.</span><span>Moving Forward.</span></div><div style={{fontSize:28,color:"#C7D2E4",marginTop:32}}>Simple, dependable delivery in Ibadan.</div></div>,size)}
