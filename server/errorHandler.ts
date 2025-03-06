import mongoose from 'mongoose'

export class ExpressError extends Error{
    name: string;
    
    status: number;
    success: boolean;
    code?: number;
    constructor();
    constructor(message: string);
    constructor(message: string, status: number);
    constructor(message?: string, status?: number){
        super(message || 'Error');
        this.name = super.name || 'Error'
        
        this.status = status || 500;
        this.success = false;
        if('code' in this){
            this.code = this.code
        }
    }
    toJSON?() {
        return {
            name: this.name,
            status: this.status,
            success: this.success,
            code: this.code,
            message: this.message,
        };
      }
};



export const handleError = (err: ExpressError, status?: number): ExpressError => {
    if(err instanceof mongoose.mongo.MongoServerError){
        console.log(true);
    }
    if('code' in err){
        return {
            name: err.name,
            status: err.status || 500, 
            success: false,
            code: (err as ExpressError).code,
            message: err.message,
        }
    }
    
    return {
        name: err.name,
        status: err.status || 500, 
        success: false,
        message: err.message,
    }
}