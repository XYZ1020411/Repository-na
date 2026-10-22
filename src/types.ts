export type OfficialStatus='normal'|'holiday'|'pending';
export type City={name:string;region:string;gust:number;wind:number;rain:number;probability:number;status:OfficialStatus;announcement?:string};
