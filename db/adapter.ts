import "server-only";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getPostgresDatabase } from "./postgres-adapter";

type Bound = { all<T>(): Promise<{results:T[]}>; first<T>(): Promise<T|null>; run(): Promise<{success:boolean}> };
type Statement = { bind(...values:unknown[]):Bound };
type LocalD1 = { prepare(sql:string):Statement; batch(statements:Bound[]):Promise<unknown[]> };
let instance: LocalD1 | undefined;

export function getDatabase(): D1Database {
  if (process.env.GFC_LOCAL_DB !== "1") return getPostgresDatabase();
  if (instance) return instance as unknown as D1Database;
  const folder=join(process.cwd(),"local-data");mkdirSync(folder,{recursive:true});
  const filename=join(folder,"gfc.sqlite");const isNew=!existsSync(filename);
  const sqlite=new DatabaseSync(filename);sqlite.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;");
  sqlite.exec("CREATE TABLE IF NOT EXISTS __gfc_migrations (name TEXT PRIMARY KEY NOT NULL)");
  const migrationFolder=join(process.cwd(),"drizzle");
  for (const name of readdirSync(migrationFolder).filter(x=>/^\\d{4}.*\\.sql$/.test(x)).sort()) {
    if (sqlite.prepare("SELECT 1 FROM __gfc_migrations WHERE name=?").get(name)) continue;
    sqlite.exec("BEGIN");
    try { sqlite.exec(readFileSync(join(migrationFolder,name),"utf8"));sqlite.prepare("INSERT INTO __gfc_migrations(name) VALUES(?)").run(name);sqlite.exec("COMMIT"); }
    catch(e){sqlite.exec("ROLLBACK");throw new Error(`Could not apply database migration ${name}`,{cause:e});}
  }
  if(isNew)console.info("GFC local database created in local-data/gfc.sqlite");
  const prepare=(sql:string):Statement=>({bind:(...values:unknown[])=>{
    const stmt=sqlite.prepare(sql); const args=values as Parameters<typeof stmt.all>;
    return {all:async<T>()=>({results:stmt.all(...args) as T[]}),first:async<T>()=>(stmt.get(...args) as T|undefined)??null,run:async()=>{stmt.run(...args);return {success:true}}};
  }});
  instance={prepare,batch:async statements=>{
    sqlite.exec("BEGIN");try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec("COMMIT");return results}
    catch(e){sqlite.exec("ROLLBACK");throw e}
  }};
  return instance as unknown as D1Database;
}
