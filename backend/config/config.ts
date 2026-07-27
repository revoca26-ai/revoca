import dotenv from 'dotenv';                                                               
import path from 'path';                                                                   
import { fileURLToPath } from 'url';                                                       
                                                                                           
// Recreate __dirname safely for ES Modules                                                
const __filename = fileURLToPath(import.meta.url);                                         
const __dirname = path.dirname(__filename);                                                
                                                                                           
// Explicitly point to the backend/.env file to prevent loading path mismatches            
dotenv.config({ path: path.resolve(__dirname, '../.env') });                               
                                                                                           
const requiredEnvVars: string[] = [                                                        
  'PORT',                                                                                  
  'DATABASE_URL',                                                                          
  'NODE_ENV',                                                                              
  'FRONTEND_URL',                                                                          
  'CLERK_PUBLISHABLE_KEY',                                                                 
  'CLERK_SECRET_KEY',                                                                      
  'CLERK_WEBHOOK_SIGNING_SECRET',                                                          
  'ENCRYPTION_KEY',                                                                        
  'OPENAI_API_KEY',                                                                        
  'COHERE_API_KEY',                                                                        
  'ROLE',                                                                                  
  'SLACK_WEBHOOK_SIGNING_SECRET',
  'GEMINI_API_KEY'                                                          
];                                                                                         
                                                                                           
// Optional providers that Track A will populate fully later.                              
// We allow these to be empty strings so Track B developers don't crash on startup.        
// @ts-ignore
const optionalEnvVars: string[] = [                                                        
  'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI',                       
  'SLACK_CLIENT_ID', 'SLACK_CLIENT_SECRET', 'SLACK_SIGNING_SECRET', 'SLACK_REDIRECT_URI',  
  'GITHUB_CLIENT_ID', 'GITHUB_REDIRECT_URI', 'GITHUB_CLIENT_SECRET'                        
];                                                                                         
                                                                                           
// Validate strictly required variables exist and are not empty strings                    
requiredEnvVars.forEach(envVar => {                                                        
  const value = process.env[envVar];                                                       
  if (!value || value.trim() === '') {                                                     
    throw new Error(`Environment configuration error: ${envVar} is not defined or is empty.`);                                                                                          
  }                                                                                        
});                                                                                        
                                                                                           
interface Config {                                                                         
  PORT: number;                                                                            
  DATABASE_URL: string;                                                                    
  NODE_ENV: string;                                                                        
  FRONTEND_URL: string;                                                                    
  CLERK_PUBLISHABLE_KEY: string;                                                           
  CLERK_SECRET_KEY: string;                                                                
  CLERK_WEBHOOK_SIGNING_SECRET: string;                                                    
  ENCRYPTION_KEY: string;                                                                  
  OPENAI_API_KEY: string;                                                                  
  COHERE_API_KEY: string;                                                                  
  ROLE: string;                                                                            
  SLACK_WEBHOOK_SIGNING_SECRET: string;  
  GEMINI_API_KEY: string;                                                  
                                                                                           
  // Optional strings for external OAuth providers                                         
  GOOGLE_CLIENT_ID: string;                                                                
  GOOGLE_CLIENT_SECRET: string;                                                            
  GOOGLE_REDIRECT_URI: string;                                                             
  SLACK_CLIENT_ID: string;                                                                 
  SLACK_CLIENT_SECRET: string;                                                             
  SLACK_SIGNING_SECRET: string;                                                            
  SLACK_REDIRECT_URI: string;                                                              
  GITHUB_CLIENT_ID: string;                                                                
  GITHUB_REDIRECT_URI: string;                                                             
  GITHUB_CLIENT_SECRET: string;                                                            
}                                                                                          
                                                                                           
const config: Config = {                                                                   
  PORT: parseInt(process.env.PORT || '3000', 10),                                          
  DATABASE_URL: process.env.DATABASE_URL!,                                                 
  NODE_ENV: process.env.NODE_ENV || 'development',                                         
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',                       
  CLERK_PUBLISHABLE_KEY: process.env.CLERK_PUBLISHABLE_KEY!,                               
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY!,                                         
  CLERK_WEBHOOK_SIGNING_SECRET: process.env.CLERK_WEBHOOK_SIGNING_SECRET!,                 
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY!,                                             
  OPENAI_API_KEY: process.env.OPENAI_API_KEY!,                                             
  COHERE_API_KEY: process.env.COHERE_API_KEY!,                                             
  ROLE: process.env.ROLE!,                                                                 
  SLACK_WEBHOOK_SIGNING_SECRET: process.env.SLACK_WEBHOOK_SIGNING_SECRET!,    
  GEMINI_API_KEY: process.env.GEMINI_API_KEY!,             
                                                                                           
  // Fall back to empty strings if not configured yet so the server boots safely           
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',                                    
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',                            
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || '',                              
  SLACK_CLIENT_ID: process.env.SLACK_CLIENT_ID || '',                                      
  SLACK_CLIENT_SECRET: process.env.SLACK_CLIENT_SECRET || '',                              
  SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET || '',                            
  SLACK_REDIRECT_URI: process.env.SLACK_REDIRECT_URI || '',                                
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID || '',                                    
  GITHUB_REDIRECT_URI: process.env.GITHUB_REDIRECT_URI || '',                              
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET || '',                            
};                                                                                         
                                                                                           
export default config;