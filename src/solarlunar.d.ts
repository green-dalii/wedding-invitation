/** solarlunar 的类型声明（其 package.json exports 未正确暴露自带 d.ts） */
declare module 'solarlunar' {
  export interface LunarInfo {
    lYear: number;
    lMonth: number;
    lDay: number;
    animal: string;
    yearCn: string;
    monthCn: string;
    dayCn: string;
    cYear: number;
    cMonth: number;
    cDay: number;
    gzYear: string;
    gzMonth: string;
    gzDay: string;
    isToday: boolean;
    isLeap: boolean;
    nWeek: number;
    ncWeek: string;
    isTerm: boolean;
    term: string;
  }
  export function solar2lunar(y: number, m: number, d: number): LunarInfo;
  export function lunar2solar(y: number, m: number, d: number): LunarInfo;
}
