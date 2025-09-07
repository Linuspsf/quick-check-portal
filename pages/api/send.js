
export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({ok:false});
  return res.status(200).json({ok:true});
}
