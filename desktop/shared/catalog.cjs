'use strict';
/** Mirrors netlify/functions/lib/plan-catalog.mjs. Regression test fails on drift. */
const plans = Object.freeze([
  Object.freeze({id:'30',days:30,title:'1 месяц',priceRub:99,deviceLimit:3}),
  Object.freeze({id:'60',days:60,title:'2 месяца',priceRub:160,deviceLimit:3}),
  Object.freeze({id:'90',days:90,title:'3 месяца',priceRub:219,deviceLimit:3}),
  Object.freeze({id:'180',days:180,title:'6 месяцев',priceRub:339,deviceLimit:3}),
  Object.freeze({id:'365',days:365,title:'1 год',priceRub:700,deviceLimit:3}),
  Object.freeze({id:'365-family',days:365,title:'Семейный тариф на год',priceRub:1000,deviceLimit:6})
]);
module.exports = {plans};
