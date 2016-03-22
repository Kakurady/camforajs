// -*- indent-tabs-mode:nil; tab-width: 2; -*- 

export function setArrayLength(to, targetLength, newFunc){
  var j;
  
  // trim to array if it's too long
  if (targetLength < to.length) {
    to.length = targetLength;
  }
  // add new entries if it's too short
  for (j = to.length; j < targetLength; j++){
    to.push( newFunc(j) );
  }
}
  
  
