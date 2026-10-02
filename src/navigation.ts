export type Page = 'home' | 'finance' | 'consumption' | 'comparison' | 'transport' | 'boundary';

export const nav: { id: Page; label: string; number: string; subtitle: string; description: string; icon: string }[] = [
  { id: 'home', label: '首页', number: '00', subtitle: '选择你要解决的问题', description: '从一个具体的消费问题开始。', icon: '⌂' },
  { id: 'finance', label: '个人财务', number: '01', subtitle: '我的财务状况', description: '现金流、安全垫与可配置资本', icon: '◫' },
  { id: 'consumption', label: '消费计算', number: '02', subtitle: '单个商品 TCO', description: '看清一件商品的完整持有成本', icon: '▤' },
  { id: 'transport', label: '出行比较', number: '03', subtitle: '通勤与出行方式', description: '把时间收益与增量成本放在一起', icon: '⇄' },
  { id: 'comparison', label: '方案比较', number: '04', subtitle: '多个方案对比', description: '同一周期比较多个方案', icon: '▥' },
  { id: 'boundary', label: '边界分析', number: '05', subtitle: '找到决策临界点', description: '反向求解时间、价格和停车费边界', icon: '◎' },
];
