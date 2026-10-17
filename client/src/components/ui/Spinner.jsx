import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { Icon } from './Icon.jsx';

export function Spinner({ className }) {
  return <Icon as={Loader2} className={cn('animate-spin', className)} />;
}
