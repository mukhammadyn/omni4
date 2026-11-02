/** Overflow is a prefix of configured order, independent of the active item.
 * Selecting an overflow item must never promote it or move its neighbours. */
export function moduleSlots<T>(modules:readonly T[],width:number,slot=30){
 const capacity=Math.max(1,Math.floor(width/slot));
 const count=modules.length<=capacity?modules.length:Math.max(0,capacity-1);
 return {shown:modules.slice(0,count),overflow:count<modules.length};
}
