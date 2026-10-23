import {getPool} from './subscription-db.mjs';

/**
 * Return the owner assigned to a verified, provider-scoped subject.
 * Creation is serialized by an advisory transaction lock on the identity,
 * so concurrent authenticated requests cannot allocate multiple owners.
 * Never call this with a user-supplied, unverified provider identity.
 */
export async function findOrCreateOwner(identity,dbPool=null){
  if(!identity || !['email','telegram','clerk'].includes(identity.provider))throw Error('INVALID_IDENTITY');
  const {provider,subject}=identity;
  if(!(provider==='telegram' && /^[1-9][0-9]{0,17}$/.test(subject)) &&
     !(provider==='email' && /^[a-f0-9]{64}$/.test(subject)) &&
     !(provider==='clerk' && /^user_[A-Za-z0-9]{8,128}$/.test(subject)))throw Error('INVALID_SUBJECT');
  const pool=dbPool||await getPool();
  const db=await pool.connect();
  try{
    await db.query('BEGIN');
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1), 61931)',[provider+':'+subject]);
    const existing=await db.query(
      'SELECT owner_id FROM vpn_account_identities WHERE provider=$1 AND subject=$2',
      [provider,subject]);
    if(existing.rows.length){
      await db.query('COMMIT');
      return existing.rows[0].owner_id;
    }
    const owner=await db.query('INSERT INTO vpn_account_owners DEFAULT VALUES RETURNING id');
    const ownerId=owner.rows[0].id;
    await db.query(
      'INSERT INTO vpn_account_identities(provider,subject,owner_id) VALUES($1,$2,$3)',
      [provider,subject,ownerId]);
    await db.query('COMMIT');
    return ownerId;
  }catch(error){
    await db.query('ROLLBACK').catch(()=>{});
    throw error;
  }finally{db.release()}
}
