import "server-only";
// pg and its type definitions are installed from package.json on the deployment host.
// @ts-ignore The isolated source check may run before dependencies are installed.
import pg from "pg";

type QueryResult={rows:Record<string,unknown>[]};
type QueryClient={query(sql:string,values?:unknown[]):Promise<QueryResult>};
type TransactionClient=QueryClient&{release():void};
type PgPool=QueryClient&{connect():Promise<TransactionClient>};
let pool:PgPool|undefined;
const getPool=():PgPool=>{
  const connectionString=process.env.DATABASE_URL;
  if(!connectionString)throw new Error("DATABASE_URL is not configured.");
  return pool??=(new pg.Pool({connectionString,max:3,idleTimeoutMillis:10000,connectionTimeoutMillis:10000}) as PgPool);
};
type Bound={all<T>():Promise<{results:T[]}>;first<T>():Promise<T|null>;run():Promise<{success:boolean}>;sql:string;args:unknown[]};
const convert=(text:string)=>{let n=0;return text.replace(/\?/g,()=>`$${++n}`)};
const execute=async(client:QueryClient,sql:string,args:unknown[])=>client.query(convert(sql),args);
export function getPostgresDatabase():D1Database{
  const db={
    prepare:(sql:string)=>({bind:(...args:unknown[]):Bound=>({sql,args,
      all:async<T>()=>({results:(await execute(getPool(),sql,args)).rows as T[]}),
      first:async<T>()=>((await execute(getPool(),sql,args)).rows[0] as T|undefined)??null,
      run:async()=>{await execute(getPool(),sql,args);return {success:true}}
    })}),
    batch:async(statements:Bound[])=>{
      const client=await getPool().connect();try{await client.query("BEGIN");const results=[];
        for(const statement of statements)results.push(await execute(client,statement.sql,statement.args));
        await client.query("COMMIT");return results;
      }catch(e){await client.query("ROLLBACK");throw e}finally{client.release()}
    }
  };
  return db as unknown as D1Database;
}
