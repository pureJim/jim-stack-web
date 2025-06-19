import type { LazyExoticComponent } from 'react';
import { Suspense } from 'react';

const LazyLoad = (Component: LazyExoticComponent<React.ComponentType>) => {
  return (
    <Suspense fallback={<div>loading</div>}>
      <Component />
    </Suspense>
  );
};

export default LazyLoad;
