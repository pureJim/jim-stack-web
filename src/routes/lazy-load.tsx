import { LazyExoticComponent, Suspense } from 'react';

const LazyLoad = (Component: LazyExoticComponent<any>) => {
  return (
    <Suspense fallback={<div>loading</div>}>
      <Component />
    </Suspense>
  );
};

export default LazyLoad;
