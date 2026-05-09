import { ReactNode } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { GripVertical } from 'lucide-react';

interface MainLayoutProps {
  sidebar: ReactNode;
  content: ReactNode;
}

export function MainLayout({ sidebar, content }: MainLayoutProps) {
  return (
    <div className="h-screen w-full bg-gray-50 overflow-hidden">
      <PanelGroup direction="horizontal">
        <Panel defaultSize={25} minSize={20} maxSize={40} className="bg-white border-r border-gray-200">
          <div className="h-full flex flex-col">
            {sidebar}
          </div>
        </Panel>
        
        <PanelResizeHandle className="w-1 bg-gray-200 hover:bg-blue-400 transition-colors cursor-col-resize flex items-center justify-center group z-10">
            <div className="h-8 w-1 bg-gray-300 rounded-full group-hover:bg-white flex items-center justify-center">
                <GripVertical size={12} className="text-gray-400 group-hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
        </PanelResizeHandle>
        
        <Panel className="bg-gray-50">
          <div className="h-full">
            {content}
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
}
