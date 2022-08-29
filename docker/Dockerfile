FROM rssw/dlc:12.2 AS dlc

FROM codercom/code-server
USER root
RUN apt update && apt install -y git && rm -rf /var/lib/apt/lists/*
COPY --from=dlc /opt/dlc-12.2/ /opt/dlc-12.2/
COPY --from=dlc /opt/amazon-corretto-11.0.7.10.1-linux-x64/ /opt/amazon-corretto-11.0.7.10.1-linux-x64/

USER coder
COPY --chown=coder:coder openedge-abl-1.3.1.vsix /home/coder
COPY --chown=coder:coder stephenwassell.light-high-contrast-theme-1.1.5.vsix /home/coder
# COPY --chown=coder:coder *.bin /home/coder/.rssw/
WORKDIR /home/coder
RUN code-server --install-extension openedge-abl-1.3.1.vsix && code-server --install-extension stephenwassell.light-high-contrast-theme-1.1.5.vsix && rm /home/coder/*.vsix
EXPOSE 8080
COPY --chown=coder:coder settings.json /home/coder/.local/share/code-server/User/settings.json
RUN mkdir /home/coder/ws
ENV JAVA_HOME=/opt/amazon-corretto-11.0.7.10.1-linux-x64 PATH=$PATH:/opt/amazon-corretto-11.0.7.10.1-linux-x64/bin
ENTRYPOINT [ "/usr/bin/entrypoint.sh", "--auth=password", "--bind-addr=0.0.0.0:8080", "/home/coder/ws" ]
