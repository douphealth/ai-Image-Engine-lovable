// services/postCache.ts - IndexedDB Post Cache (extracted from App.tsx)

import { WordPressPost } from '../types';

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export class PostCache {
  private dbName = 'ai-image-engine-cache-v3';
  private storeName = 'posts';
  private metaStore = 'meta';
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 3);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (db.objectStoreNames.contains(this.storeName)) db.deleteObjectStore(this.storeName);
        if (db.objectStoreNames.contains(this.metaStore)) db.deleteObjectStore(this.metaStore);
        
        const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
        store.createIndex('siteUrl', 'siteUrl', { unique: false });
        store.createIndex('fetchedAt', 'fetchedAt', { unique: false });
        db.createObjectStore(this.metaStore, { keyPath: 'siteUrl' });
      };
    });
  }

  async getCachedPosts(siteUrl: string): Promise<{ posts: WordPressPost[]; isFresh: boolean; cachedAt: number } | null> {
    if (!this.db) await this.init();
    
    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction([this.storeName, this.metaStore], 'readonly');
        const store = tx.objectStore(this.storeName);
        const metaStore = tx.objectStore(this.metaStore);
        const index = store.index('siteUrl');
        
        const metaRequest = metaStore.get(siteUrl);
        const postsRequest = index.getAll(siteUrl);
        
        tx.oncomplete = () => {
          const meta = metaRequest.result;
          const results = postsRequest.result;
          
          if (!results.length || !meta) { resolve(null); return; }
          
          resolve({
            posts: results.map((r: any) => r.post),
            isFresh: Date.now() - meta.fetchedAt < CACHE_TTL,
            cachedAt: meta.fetchedAt,
          });
        };
        
        tx.onerror = () => {
          console.error('PostCache getCachedPosts transaction error:', tx.error);
          resolve(null);
        };
      } catch (e) {
        console.error('PostCache getCachedPosts error:', e);
        resolve(null);
      }
    });
  }

  async cachePosts(siteUrl: string, posts: WordPressPost[]): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction([this.storeName, this.metaStore], 'readwrite');
        const store = tx.objectStore(this.storeName);
        const metaStore = tx.objectStore(this.metaStore);
        const now = Date.now();
        
        const index = store.index('siteUrl');
        const clearRequest = index.openCursor(IDBKeyRange.only(siteUrl));
        clearRequest.onsuccess = () => {
          const cursor = clearRequest.result;
          if (cursor) { cursor.delete(); cursor.continue(); }
        };
        
        for (const post of posts) {
          store.put({ id: `${siteUrl}-${post.id}`, siteUrl, post, fetchedAt: now });
        }
        
        metaStore.put({ siteUrl, fetchedAt: now, postCount: posts.length });
        
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      } catch (error) {
        reject(error);
      }
    });
  }

  async clearCache(siteUrl?: string): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction([this.storeName, this.metaStore], 'readwrite');
        const store = tx.objectStore(this.storeName);
        const metaStore = tx.objectStore(this.metaStore);
        
        if (siteUrl) {
          const index = store.index('siteUrl');
          const request = index.openCursor(IDBKeyRange.only(siteUrl));
          request.onsuccess = () => {
            const cursor = request.result;
            if (cursor) { cursor.delete(); cursor.continue(); }
          };
          metaStore.delete(siteUrl);
        } else {
          store.clear();
          metaStore.clear();
        }
        
        tx.oncomplete = () => resolve();
        tx.onerror = () => {
          console.error('PostCache clearCache transaction error:', tx.error);
          resolve();
        };
      } catch (e) {
        console.error('PostCache clearCache error:', e);
        resolve();
      }
    });
  }
}

export default PostCache;
